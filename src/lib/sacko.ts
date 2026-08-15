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
 * Last place per completed season - the sacko. The playoffs (a "toilet
 * bowl" losers bracket) decide this, same as the winners bracket decides
 * the champion, so a bad-record team can dodge dead last by winning
 * their bracket and a decent-record team can land there by losing it.
 * Falls back to worst win rate (points as tiebreak) only for a season
 * that didn't run a losers bracket.
 */
export function getSackoHistory(history: LeagueHistory): SackoEntry[] {
  const entries: SackoEntry[] = [];

  for (const season of history.seasons) {
    if (season.status !== "complete" || season.rosters.length === 0) continue;

    let worstRoster = season.rosters.find((r) => r.rosterId === season.sackoRosterId) ?? null;

    if (!worstRoster) {
      const ranked = season.rosters
        .filter((r) => r.ownerUserId && history.managers[r.ownerUserId])
        .map((r) => {
          const games = r.wins + r.losses + r.ties;
          return { roster: r, winPct: games > 0 ? (r.wins + r.ties * 0.5) / games : 0 };
        })
        .sort((a, b) => a.winPct - b.winPct || a.roster.pointsFor - b.roster.pointsFor);
      worstRoster = ranked[0]?.roster ?? null;
    }

    const manager =
      worstRoster?.ownerUserId ? history.managers[worstRoster.ownerUserId] : undefined;
    if (!worstRoster || !manager) continue;

    entries.push({
      season: season.season,
      manager,
      wins: worstRoster.wins,
      losses: worstRoster.losses,
      pointsFor: worstRoster.pointsFor,
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
