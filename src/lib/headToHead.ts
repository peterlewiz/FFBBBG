import type { LeagueHistory } from "./history";

export interface HeadToHeadGame {
  season: string;
  week: number;
  pointsA: number;
  pointsB: number;
}

export interface HeadToHeadResult {
  games: HeadToHeadGame[]; // chronological, oldest first
  winsA: number;
  winsB: number;
  ties: number;
  totalPointsA: number;
  totalPointsB: number;
}

/**
 * Every decided matchup between two specific managers, across all
 * seasons, plus the aggregate record and combined points scored in
 * those head-to-head games specifically (not their overall career
 * totals).
 */
export function computeHeadToHead(
  history: LeagueHistory,
  userIdA: string,
  userIdB: string,
): HeadToHeadResult {
  const games: HeadToHeadGame[] = [];

  for (const season of history.seasons) {
    const rosterToUser = new Map(
      season.rosters.filter((r) => r.ownerUserId).map((r) => [r.rosterId, r.ownerUserId as string]),
    );
    const weeks = Array.from(new Set(season.weeks.map((w) => w.week))).sort((a, b) => a - b);

    for (const week of weeks) {
      const rows = season.weeks.filter((w) => w.week === week);
      const byMatchup = new Map<number, typeof rows>();
      for (const row of rows) {
        if (row.matchupId === null) continue;
        const arr = byMatchup.get(row.matchupId) ?? [];
        arr.push(row);
        byMatchup.set(row.matchupId, arr);
      }

      for (const pair of byMatchup.values()) {
        if (pair.length !== 2) continue;
        const [x, y] = pair;
        const userX = rosterToUser.get(x.rosterId);
        const userY = rosterToUser.get(y.rosterId);
        if (!userX || !userY) continue;

        const isMatchup =
          (userX === userIdA && userY === userIdB) || (userX === userIdB && userY === userIdA);
        if (!isMatchup) continue;
        if (x.points <= 0 && y.points <= 0) continue; // not played yet

        const pointsA = userX === userIdA ? x.points : y.points;
        const pointsB = userX === userIdA ? y.points : x.points;
        games.push({ season: season.season, week, pointsA, pointsB });
      }
    }
  }

  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  let totalPointsA = 0;
  let totalPointsB = 0;
  for (const g of games) {
    totalPointsA += g.pointsA;
    totalPointsB += g.pointsB;
    if (g.pointsA > g.pointsB) winsA++;
    else if (g.pointsB > g.pointsA) winsB++;
    else ties++;
  }

  return { games, winsA, winsB, ties, totalPointsA, totalPointsB };
}
