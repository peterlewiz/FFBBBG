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
  /** Raw hit rate, 0-1. What you actually went. */
  accuracy: number;
  /**
   * Accuracy averaged with a coin-flip baseline, weighted by how many
   * picks back it up. This is what the board is ranked on; `accuracy` is
   * what it shows you went.
   */
  weightedAccuracy: number;
}

/**
 * How much evidence the coin-flip baseline is worth, in picks.
 *
 * Six is one full week of matchups in this league, so a manager's first
 * week counts half towards 50% and only pulls its own weight from week
 * two. Without this the board is decided by whoever has picked least: a
 * single lucky pick is 100% and tops anyone who has actually turned up
 * all season. Picking winners is a coin flip until proven otherwise, so
 * a coin flip is what a thin record is pulled towards.
 */
const BASELINE_PICKS = 6;
/** What an unproven picker is assumed to be: no better than chance. */
const BASELINE_ACCURACY = 0.5;

/**
 * A weighted average of a manager's real accuracy and the baseline, with
 * their own record weighted by how many picks it contains.
 *
 * At equal accuracy the longer record still wins, but only on the
 * tiebreak - the weighting alone can't separate 1/2 from 5/10 because
 * both sit exactly on the baseline being averaged in. That's what the
 * `total` tiebreak in the sort is for.
 */
export function weightedAccuracy(correct: number, total: number): number {
  return (correct + BASELINE_PICKS * BASELINE_ACCURACY) / (total + BASELINE_PICKS);
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
      weightedAccuracy: weightedAccuracy(correct, total),
    }))
    .filter((e) => e.manager)
    // Total picks breaks a tie before raw accuracy does: two managers on
    // the same weighted score are separated by who has more of a record,
    // which is the whole point of weighting in the first place.
    .sort(
      (a, b) =>
        b.weightedAccuracy - a.weightedAccuracy ||
        b.total - a.total ||
        b.accuracy - a.accuracy,
    );
}

export interface MatchupOutcome {
  matchupId: number;
  userA: string;
  userB: string;
  /** Null until the matchup is decided, and for ties. */
  winnerUserId: string | null;
  decided: boolean;
}

/** Every matchup in a week, with its result where one exists. Shares the
 * scoring rules used by computeLeaderboard: a matchup counts only once
 * points exist and the two sides differ. */
export function resolveWeekOutcomes(
  history: LeagueHistory,
  season: string,
  week: number,
): MatchupOutcome[] {
  const s = history.seasons.find((x) => x.season === season);
  if (!s) return [];
  const rosterToUser = new Map(
    s.rosters.filter((r) => r.ownerUserId).map((r) => [r.rosterId, r.ownerUserId as string]),
  );

  const byMatchup = new Map<number, typeof s.weeks>();
  for (const row of s.weeks) {
    if (row.week !== week || row.matchupId === null) continue;
    const arr = byMatchup.get(row.matchupId) ?? [];
    arr.push(row);
    byMatchup.set(row.matchupId, arr);
  }

  const out: MatchupOutcome[] = [];
  for (const [matchupId, pair] of byMatchup) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    const userA = rosterToUser.get(a.rosterId);
    const userB = rosterToUser.get(b.rosterId);
    if (!userA || !userB) continue;
    const played = a.points > 0 || b.points > 0;
    const decided = played && a.points !== b.points;
    out.push({
      matchupId,
      userA,
      userB,
      decided,
      winnerUserId: decided ? ((a.points > b.points ? userA : userB) as string) : null,
    });
  }
  return out.sort((x, y) => x.matchupId - y.matchupId);
}

export interface WeekPickCell {
  matchupId: number;
  /** Null when this picker skipped the matchup. */
  pickedUserId: string | null;
  /** Null when the matchup isn't decided yet, so an unplayed game reads
   * as pending rather than as a miss. */
  correct: boolean | null;
}

export interface WeekPickRow {
  manager: Manager;
  cells: WeekPickCell[];
  correct: number;
  scored: number;
}

/**
 * One row per manager for a single week, aligned to that week's matchup
 * order so every row's columns line up and can be read down as well as
 * across.
 */
export function computeWeekPicks(
  history: LeagueHistory,
  predictions: PredictionRow[],
  season: string,
  week: number,
  outcomes: MatchupOutcome[],
): WeekPickRow[] {
  const forWeek = predictions.filter((p) => p.season === season && p.week === week);
  const byPicker = new Map<string, PredictionRow[]>();
  for (const p of forWeek) {
    const arr = byPicker.get(p.picker_user_id) ?? [];
    arr.push(p);
    byPicker.set(p.picker_user_id, arr);
  }

  const rows: WeekPickRow[] = [];
  for (const [userId, picks] of byPicker) {
    const manager = history.managers[userId];
    // Skip anyone who isn't a real league manager - the table stays a
    // league view rather than surfacing stray rows.
    if (!manager) continue;

    let correct = 0;
    let scored = 0;
    const cells = outcomes.map((o) => {
      const pick = picks.find((p) => p.matchup_id === o.matchupId);
      if (!pick) return { matchupId: o.matchupId, pickedUserId: null, correct: null };
      if (!o.decided) return { matchupId: o.matchupId, pickedUserId: pick.picked_user_id, correct: null };
      const isRight = pick.picked_user_id === o.winnerUserId;
      scored += 1;
      if (isRight) correct += 1;
      return { matchupId: o.matchupId, pickedUserId: pick.picked_user_id, correct: isRight };
    });

    rows.push({ manager, cells, correct, scored });
  }

  return rows.sort(
    (a, b) =>
      b.correct - a.correct ||
      b.scored - a.scored ||
      a.manager.displayName.localeCompare(b.manager.displayName),
  );
}

/** Weeks that have at least one prediction stored, most recent first. */
export function weeksWithPredictions(predictions: PredictionRow[], season: string): number[] {
  return [...new Set(predictions.filter((p) => p.season === season).map((p) => p.week))].sort(
    (a, b) => b - a,
  );
}
