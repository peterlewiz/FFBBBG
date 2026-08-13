import type { LeagueHistory, Manager } from "./history";

const BASE_RATING = 1500;
const K_FACTOR = 20;

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** Bigger blowouts move ratings a bit more than nail-biters, capped at 2x. */
function marginMultiplier(pointDiff: number): number {
  return 1 + Math.min(Math.log(Math.abs(pointDiff) + 1) / 10, 1);
}

export interface EloSnapshot {
  season: string;
  week: number;
  ratings: Record<string, number>; // userId -> rating, after this week
}

export interface EloResult {
  ratings: Record<string, number>; // userId -> current rating
  history: EloSnapshot[]; // one entry per (season, week) played, chronological
}

/**
 * Replay every historical matchup chronologically, updating a simple
 * margin-of-victory-adjusted Elo rating per manager. Everyone starts at
 * 1500; ratings only move once real games have been played.
 */
export function computeEloRatings(history: LeagueHistory): EloResult {
  const ratings: Record<string, number> = {};
  for (const userId of Object.keys(history.managers)) {
    ratings[userId] = BASE_RATING;
  }

  const snapshots: EloSnapshot[] = [];

  for (const season of history.seasons) {
    const rosterToUser = new Map<number, string>();
    for (const r of season.rosters) {
      if (r.ownerUserId) rosterToUser.set(r.rosterId, r.ownerUserId);
    }

    const weeksPlayed = Array.from(new Set(season.weeks.map((w) => w.week))).sort(
      (a, b) => a - b,
    );

    for (const week of weeksPlayed) {
      const weekRows = season.weeks.filter((w) => w.week === week);
      // Group by matchup_id to find head-to-head pairs.
      const byMatchup = new Map<number, typeof weekRows>();
      for (const row of weekRows) {
        if (row.matchupId === null) continue;
        const arr = byMatchup.get(row.matchupId) ?? [];
        arr.push(row);
        byMatchup.set(row.matchupId, arr);
      }

      for (const pair of byMatchup.values()) {
        if (pair.length !== 2) continue; // skip byes / malformed pairs
        const [a, b] = pair;
        const userA = rosterToUser.get(a.rosterId);
        const userB = rosterToUser.get(b.rosterId);
        if (!userA || !userB) continue;

        const ratingA = ratings[userA];
        const ratingB = ratings[userB];
        const expA = expectedScore(ratingA, ratingB);
        const expB = 1 - expA;

        let actualA: number;
        if (a.points > b.points) actualA = 1;
        else if (a.points < b.points) actualA = 0;
        else actualA = 0.5;
        const actualB = 1 - actualA;

        const mult = marginMultiplier(a.points - b.points);

        ratings[userA] = ratingA + K_FACTOR * mult * (actualA - expA);
        ratings[userB] = ratingB + K_FACTOR * mult * (actualB - expB);
      }

      snapshots.push({
        season: season.season,
        week,
        ratings: { ...ratings },
      });
    }
  }

  return { ratings, history: snapshots };
}

export interface EloLeaderboardEntry {
  manager: Manager;
  rating: number;
}

export function getEloLeaderboard(
  history: LeagueHistory,
  eloResult: EloResult,
): EloLeaderboardEntry[] {
  return Object.entries(eloResult.ratings)
    .map(([userId, rating]) => ({
      manager: history.managers[userId],
      rating: Math.round(rating),
    }))
    .filter((e) => e.manager)
    .sort((a, b) => b.rating - a.rating);
}

/** Win probability for manager A vs manager B based on current Elo ratings. */
export function winProbability(ratingA: number, ratingB: number): number {
  return expectedScore(ratingA, ratingB);
}
