import { supabase } from "./supabaseClient";

export interface PowerRankingRow {
  league_id: string;
  season: string;
  week: number;
  user_id: string;
  rank: number;
  /** Shady's write-up for this team's placement. */
  note?: string | null;
}

/**
 * The one-time table setup, duplicated from supabase/schema.sql so the
 * page can hand it straight to whoever's trying to post. Until this runs
 * there is nothing to write to, and every save fails - having it a click
 * away beats an error message pointing at a file in the repo.
 */
export const SETUP_SQL = `create table if not exists power_rankings (
  id uuid primary key default gen_random_uuid(),
  league_id text not null,
  season text not null,
  week int not null,
  user_id text not null,
  rank int not null,
  note text,
  updated_at timestamptz not null default now(),
  unique (league_id, season, week, user_id)
);

alter table power_rankings enable row level security;

create policy "public read" on power_rankings
  for select using (true);

create policy "public insert" on power_rankings
  for insert with check (true);

create policy "public update" on power_rankings
  for update using (true) with check (true);`;

/**
 * True when the failure is just "this table hasn't been created yet"
 * (PostgREST reports it as PGRST205 / a schema-cache miss) rather than
 * something actually wrong. Worth distinguishing: until SETUP_SQL is
 * run, reading is *expected* to fail, and showing a raw Postgres string
 * for it is only noise.
 */
export function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("power_rankings") ||
    (error.message ?? "").includes("schema cache")
  );
}

export interface RankingsFetch {
  rows: PowerRankingRow[];
  /** The table doesn't exist yet, so this isn't "no rankings posted" -
   * it's "nothing can be posted". The editor surfaces the setup SQL on
   * this rather than letting every save fail with the same error. */
  tableMissing: boolean;
}

export async function fetchRankings(leagueId: string, season: string): Promise<RankingsFetch> {
  if (!supabase) return { rows: [], tableMissing: false };
  const { data, error } = await supabase
    .from("power_rankings")
    .select("*")
    .eq("league_id", leagueId)
    .eq("season", season);
  if (error) {
    if (isMissingTableError(error)) return { rows: [], tableMissing: true };
    throw new Error(error.message);
  }
  return { rows: data ?? [], tableMissing: false };
}

export interface RankingEntry {
  userId: string;
  /** Why they're here. Empty string saves as null. */
  note: string;
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
  entries: RankingEntry[],
): Promise<void> {
  if (!supabase) throw new Error("Rankings aren't configured yet.");
  const rows = entries.map((entry, i) => ({
    league_id: leagueId,
    season,
    week,
    user_id: entry.userId,
    rank: i + 1,
    note: entry.note.trim() || null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("power_rankings")
    .upsert(rows, { onConflict: "league_id,season,week,user_id" });
  // Saving is the moment the missing table actually matters, so say
  // something useful here rather than passing the Postgres text through.
  if (error) {
    throw new Error(
      isMissingTableError(error)
        ? "Nothing saved - the power_rankings table doesn't exist in Supabase yet. Run the setup SQL below, then save again."
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
  /** Shady's reasoning for the placement, if he wrote one. */
  note: string | null;
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
      note: r.note?.trim() ? r.note.trim() : null,
    };
  });
}

function movementLabel(delta: number | null): string {
  if (delta === null) return "NEW";
  if (delta === 0) return "-";
  return delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`;
}

/**
 * A week's rankings as text to paste into Discord.
 *
 * Two shapes, because one format can't do both jobs. With no write-ups
 * it's a fenced code block: Discord renders those monospaced, which is
 * the only way rank/name/movement columns actually line up. Once there
 * are write-ups, column alignment stops being the point - a code block
 * would also strip the bold and wrap the prose badly - so each team
 * becomes a bold line with its reasoning in a blockquote under it.
 */
export function formatForDiscord(
  ranking: RankedTeam[],
  displayNameFor: (userId: string) => string,
  week: number,
): string {
  if (ranking.length === 0) return "";
  const title = `**Shady's Power Rankings - Week ${week}**`;

  if (ranking.some((r) => r.note)) {
    const blocks = ranking.map((r) => {
      const head = `**${r.rank}. ${displayNameFor(r.userId)}**  ${movementLabel(r.delta)}`;
      // Every line of a multi-line note needs its own '>' or Discord
      // ends the quote at the first newline.
      const body = r.note
        ? "\n" +
          r.note
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")
        : "";
      return head + body;
    });
    return [title, "", blocks.join("\n\n")].join("\n");
  }

  const rows = ranking.map((r) => ({
    rank: String(r.rank),
    name: displayNameFor(r.userId),
    // Movement is the last column, so arrows can't knock the rank and
    // name columns out of alignment even if a font renders them wide.
    move: movementLabel(r.delta),
  }));

  const rankWidth = Math.max(...rows.map((r) => r.rank.length));
  const nameWidth = Math.max(...rows.map((r) => r.name.length));

  const body = rows
    .map((r) => `${r.rank.padStart(rankWidth)}  ${r.name.padEnd(nameWidth)}  ${r.move}`)
    .join("\n");

  return [title, "```", body, "```"].join("\n");
}
