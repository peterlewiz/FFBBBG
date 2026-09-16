import { supabase } from "./supabaseClient";

export interface PowerRankingRow {
  league_id: string;
  season: string;
  week: number;
  user_id: string;
  rank: number;
  note?: string | null;
}

export async function fetchRankings(leagueId: string, season: string): Promise<PowerRankingRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("power_rankings")
    .select("*")
    .eq("league_id", leagueId)
    .eq("season", season);
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
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
