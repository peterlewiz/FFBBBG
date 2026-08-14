import type { LeagueHistory } from "./history";

export interface Streak {
  type: "W" | "L";
  length: number;
}

/**
 * Walk every decided game in chronological order (oldest season/week
 * first) and return each manager's current streak - how many games in a
 * row, right up to their most recent decided game, they've won or lost.
 */
export function computeCurrentStreaks(history: LeagueHistory): Record<string, Streak> {
  const results: Record<string, ("W" | "L")[]> = {};

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
        const [a, b] = pair;
        if (a.points <= 0 && b.points <= 0) continue; // not played yet
        if (a.points === b.points) continue; // tie - doesn't extend or break a streak

        const userA = rosterToUser.get(a.rosterId);
        const userB = rosterToUser.get(b.rosterId);
        const aWon = a.points > b.points;
        if (userA) (results[userA] ??= []).push(aWon ? "W" : "L");
        if (userB) (results[userB] ??= []).push(aWon ? "L" : "W");
      }
    }
  }

  const streaks: Record<string, Streak> = {};
  for (const [userId, games] of Object.entries(results)) {
    if (games.length === 0) continue;
    const last = games[games.length - 1];
    let length = 0;
    for (let i = games.length - 1; i >= 0 && games[i] === last; i--) length++;
    streaks[userId] = { type: last, length };
  }
  return streaks;
}
