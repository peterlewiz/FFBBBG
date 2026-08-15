import type { LeagueHistory, Manager } from "./history";
import { computeCurrentStreaks } from "./streaks";

export interface SackoEntry {
  season: string;
  manager: Manager;
  wins: number;
  losses: number;
  pointsFor: number;
}

/**
 * Last place per completed season - the sacko. Sleeper exposes a losers
 * bracket, but we don't fetch it, so this uses final standings: worst
 * win rate, and lowest points scored as the tiebreak.
 */
export function getSackoHistory(history: LeagueHistory): SackoEntry[] {
  const entries: SackoEntry[] = [];

  for (const season of history.seasons) {
    if (season.status !== "complete" || season.rosters.length === 0) continue;

    const ranked = season.rosters
      .filter((r) => r.ownerUserId && history.managers[r.ownerUserId])
      .map((r) => {
        const games = r.wins + r.losses + r.ties;
        return { roster: r, winPct: games > 0 ? (r.wins + r.ties * 0.5) / games : 0 };
      })
      .sort((a, b) => a.winPct - b.winPct || a.roster.pointsFor - b.roster.pointsFor);

    const worst = ranked[0];
    const manager = worst && history.managers[worst.roster.ownerUserId as string];
    if (!worst || !manager) continue;

    entries.push({
      season: season.season,
      manager,
      wins: worst.roster.wins,
      losses: worst.roster.losses,
      pointsFor: worst.roster.pointsFor,
    });
  }

  return entries.reverse();
}

export interface ShameCount {
  manager: Manager;
  count: number;
  seasons: string[];
}

/** Who has finished last most often. */
export function getSackoCounts(history: LeagueHistory): ShameCount[] {
  const counts = new Map<string, ShameCount>();
  for (const entry of getSackoHistory(history)) {
    if (!entry.manager) continue;
    const existing = counts.get(entry.manager.userId);
    if (existing) {
      existing.count += 1;
      existing.seasons.push(entry.season);
    } else {
      counts.set(entry.manager.userId, {
        manager: entry.manager,
        count: 1,
        seasons: [entry.season],
      });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export interface WorstStreak {
  manager: Manager;
  length: number;
}

/** Longest active losing streak among current league members. */
export function getWorstActiveStreak(history: LeagueHistory): WorstStreak | null {
  const latest = history.seasons[history.seasons.length - 1];
  const active = new Set(
    (latest?.rosters ?? []).map((r) => r.ownerUserId).filter((id): id is string => !!id),
  );

  let worst: WorstStreak | null = null;
  for (const [userId, streak] of Object.entries(computeCurrentStreaks(history))) {
    if (!active.has(userId) || streak.type !== "L") continue;
    const manager = history.managers[userId];
    if (!manager) continue;
    if (!worst || streak.length > worst.length) worst = { manager, length: streak.length };
  }
  return worst;
}
