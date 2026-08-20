import { supabase } from "./supabaseClient";
import type { PlayoffOddsResult } from "./playoffOdds";

export interface PlayoffOddsSnapshotRow {
  league_id: string;
  season: string;
  week: number;
  user_id: string;
  playoff_pct: number;
  title_pct: number;
}

/** Every stored snapshot row for this league/season, most recent write first. */
async function fetchAllSnapshots(
  leagueId: string,
  season: string,
): Promise<PlayoffOddsSnapshotRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("playoff_odds_snapshots")
    .select("*")
    .eq("league_id", leagueId)
    .eq("season", season);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * The most recent stored snapshot strictly before `week` - i.e. "what the
 * odds looked like as of last week", to diff the live computation against.
 * Null if nothing's been stored yet (first time this season sees a snapshot).
 */
export async function fetchPreviousSnapshot(
  leagueId: string,
  season: string,
  week: number,
): Promise<{ week: number; byUserId: Record<string, PlayoffOddsSnapshotRow> } | null> {
  const rows = await fetchAllSnapshots(leagueId, season);
  const priorWeeks = rows.map((r) => r.week).filter((w) => w < week);
  if (priorWeeks.length === 0) return null;
  const targetWeek = Math.max(...priorWeeks);
  const byUserId: Record<string, PlayoffOddsSnapshotRow> = {};
  for (const row of rows) {
    if (row.week === targetWeek) byUserId[row.user_id] = row;
  }
  return { week: targetWeek, byUserId };
}

/**
 * Records this week's freshly-computed odds, overwriting this week's own
 * prior write (if any) - deliberately, so the last visit of the week
 * leaves the truest snapshot in place once all that week's games are in.
 */
export async function saveSnapshot(
  leagueId: string,
  week: number,
  result: PlayoffOddsResult,
): Promise<void> {
  if (!supabase) return;
  const rows: PlayoffOddsSnapshotRow[] = result.entries.map((e) => ({
    league_id: leagueId,
    season: result.season,
    week,
    user_id: e.userId,
    playoff_pct: e.playoffPct,
    title_pct: e.titlePct,
  }));
  const { error } = await supabase
    .from("playoff_odds_snapshots")
    .upsert(rows, { onConflict: "league_id,season,week,user_id" });
  // Best-effort - a failed snapshot write shouldn't break the page, the
  // reader just won't have this week's number to diff against later.
  if (error) console.error("Failed to save playoff odds snapshot:", error.message);
}
