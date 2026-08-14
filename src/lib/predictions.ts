import { supabase } from "./supabaseClient";
import type { LeagueHistory, Manager } from "./history";

export interface PredictionRow {
  id?: string;
  league_id: string;
  season: string;
  week: number;
  matchup_id: number;
  picker_user_id: string;
  picker_display_name: string;
  team_a_user_id: string;
  team_b_user_id: string;
  picked_user_id: string;
}

export async function fetchPredictions(leagueId: string): Promise<PredictionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .eq("league_id", leagueId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertPrediction(row: PredictionRow): Promise<void> {
  if (!supabase) throw new Error("Predictions aren't configured yet.");
  const { error } = await supabase
    .from("predictions")
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: "league_id,season,week,matchup_id,picker_user_id" },
    );
  if (error) throw new Error(error.message);
}

export interface LeaderboardEntry {
  manager: Manager;
  correct: number;
  total: number;
  accuracy: number; // 0-1
}

/**
 * Score every prediction whose matchup has an actual, decided result
 * (both sides have points and one side has more), and tally per picker.
 * Predictions for matchups that haven't happened yet, or that ended in a
 * tie, aren't counted either way.
 */
export function computeLeaderboard(
  history: LeagueHistory,
  predictions: PredictionRow[],
): LeaderboardEntry[] {
  const tallies = new Map<string, { correct: number; total: number }>();

  for (const pred of predictions) {
    const season = history.seasons.find((s) => s.season === pred.season);
    if (!season) continue;

    const rosterToUser = new Map(
      season.rosters.filter((r) => r.ownerUserId).map((r) => [r.rosterId, r.ownerUserId as string]),
    );
    const weekRows = season.weeks.filter(
      (w) => w.week === pred.week && w.matchupId === pred.matchup_id,
    );
    if (weekRows.length !== 2) continue; // matchup not found / malformed

    const [a, b] = weekRows;
    if (a.points <= 0 && b.points <= 0) continue; // not played yet
    if (a.points === b.points) continue; // tie, doesn't count

    const winnerRosterId = a.points > b.points ? a.rosterId : b.rosterId;
    const winnerUserId = rosterToUser.get(winnerRosterId);
    if (!winnerUserId) continue;

    const entry = tallies.get(pred.picker_user_id) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (pred.picked_user_id === winnerUserId) entry.correct += 1;
    tallies.set(pred.picker_user_id, entry);
  }

  return Array.from(tallies.entries())
    .map(([userId, { correct, total }]) => ({
      manager: history.managers[userId],
      correct,
      total,
      accuracy: total > 0 ? correct / total : 0,
    }))
    .filter((e) => e.manager)
    .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct);
}
