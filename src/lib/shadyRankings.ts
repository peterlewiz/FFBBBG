import { supabase } from "./supabaseClient";

export interface PowerRankingRow {
  league_id: string;
  season: string;
  week: number;
  user_id: string;
  rank: number;
  note?: string | null;
}

/**
 * True when the failure is just "this table hasn't been created yet"
 * (PostgREST reports it as PGRST205 / a schema-cache miss) rather than
 * something actually wrong. Worth distinguishing: until the SQL in
 * supabase/schema.sql is run, reading is *expected* to fail, and
 * showing a raw Postgres string for it is only noise.
 */
export function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("power_rankings") ||
    (error.message ?? "").includes("schema cache")
  );
}

export async function fetchRankings(leagueId: string, season: string): Promise<PowerRankingRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("power_rankings")
    .select("*")
    .eq("league_id", leagueId)
    .eq("season", season);
  // No table yet reads the same as no rankings yet - the page shows
  // "No rankings posted yet" rather than a database error.
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

/**
 * Writes a whole week's ordering in one upsert - the list is meaningless
 * half-saved, and upserting on the unique key lets a week be re-ranked as
 * many times as you like without piling up rows.
 */
export async function saveRankings(
  leagueId: string,
  season: string,
  week: number,
  orderedUserIds: string[],
): Promise<void> {
  if (!supabase) throw new Error("Rankings aren't configured yet.");
  const rows: PowerRankingRow[] = orderedUserIds.map((userId, i) => ({
    league_id: leagueId,
    season,
    week,
    user_id: userId,
    rank: i + 1,
  }));
  const { error } = await supabase
    .from("power_rankings")
    .upsert(
      rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "league_id,season,week,user_id" },
    );
  // Saving is the moment the missing table actually matters, so say
  // something useful here rather than passing the Postgres text through.
  if (error) {
    throw new Error(
      isMissingTableError(error)
        ? "Rankings can't save yet - the power_rankings table still needs creating in Supabase (see supabase/schema.sql)."
        : error.message,
    );
  }
}

/** Weeks that have a saved ranking, most recent first. */
export function rankedWeeks(rows: PowerRankingRow[]): number[] {
  return [...new Set(rows.map((r) => r.week))].sort((a, b) => b - a);
}

export interface RankedTeam {
  userId: string;
  rank: number;
  /** Places gained since the previous ranked week. Positive = moved up.
   * Null when there's no earlier week to compare against, or the team
   * wasn't ranked then. */
  delta: number | null;
}

/**
 * One week's ordering, each team carrying its movement against the most
 * recent *earlier* ranked week - not week-1 specifically, so a skipped
 * week compares against the last real ranking instead of showing
 * everyone as new.
 */
export function rankingForWeek(rows: PowerRankingRow[], week: number): RankedTeam[] {
  const thisWeek = rows.filter((r) => r.week === week).sort((a, b) => a.rank - b.rank);
  const earlier = rows.map((r) => r.week).filter((w) => w < week);
  const prevWeek = earlier.length > 0 ? Math.max(...earlier) : null;
  const prevByUser = new Map(
    prevWeek === null ? [] : rows.filter((r) => r.week === prevWeek).map((r) => [r.user_id, r.rank]),
  );

  return thisWeek.map((r) => {
    const before = prevByUser.get(r.user_id);
    // A smaller rank number is better, so moving from 5 to 2 is +3.
    return {
      userId: r.user_id,
      rank: r.rank,
      delta: before === undefined ? null : before - r.rank,
    };
  });
}

/**
 * A week's rankings as text to paste into Discord.
 *
 * The table goes inside a fenced code block on purpose: Discord renders
 * those in a monospace font, which is the only way the rank, name and
 * movement columns actually line up. In normal proportional text the
 * columns drift and it reads like a ransom note. The title sits outside
 * the block so it still renders bold.
 */
export function formatForDiscord(
  ranking: RankedTeam[],
  displayNameFor: (userId: string) => string,
  week: number,
): string {
  if (ranking.length === 0) return "";

  const rows = ranking.map((r) => ({
    rank: String(r.rank),
    name: displayNameFor(r.userId),
    // Movement is the last column, so arrows can't knock the rank and
    // name columns out of alignment even if a font renders them wide.
    move:
      r.delta === null
        ? "NEW"
        : r.delta === 0
          ? "-"
          : r.delta > 0
            ? `▲${r.delta}`
            : `▼${Math.abs(r.delta)}`,
  }));

  const rankWidth = Math.max(...rows.map((r) => r.rank.length));
  const nameWidth = Math.max(...rows.map((r) => r.name.length));

  const body = rows
    .map((r) => `${r.rank.padStart(rankWidth)}  ${r.name.padEnd(nameWidth)}  ${r.move}`)
    .join("\n");

  return [`**Shady's Power Rankings - Week ${week}**`, "```", body, "```"].join("\n");
}
