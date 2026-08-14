import type { LeagueHistory, Manager, SeasonData } from "./history";
import { LEGACY_SEASONS } from "./legacySeasons";

export interface ChampionEntry {
  season: string;
  champion: Manager | null;
  runnerUp: Manager | null;
  /** Set for seasons played before Sleeper, e.g. "ESPN". */
  platform?: string;
}

function findManagerForRoster(
  season: SeasonData,
  managers: Record<string, Manager>,
  rosterId: number | null,
): Manager | null {
  if (rosterId === null) return null;
  const roster = season.rosters.find((r) => r.rosterId === rosterId);
  if (!roster?.ownerUserId) return null;
  return managers[roster.ownerUserId] ?? null;
}

/**
 * One entry per season with a resolved champion, newest first - Sleeper
 * seasons plus the hand-entered pre-Sleeper ones (see legacySeasons.ts).
 */
export function getChampionHistory(history: LeagueHistory): ChampionEntry[] {
  const fromSleeper: ChampionEntry[] = history.seasons
    .filter((s) => s.status === "complete" && s.championRosterId !== null)
    .map((s) => ({
      season: s.season,
      champion: findManagerForRoster(s, history.managers, s.championRosterId),
      runnerUp: findManagerForRoster(s, history.managers, s.runnerUpRosterId),
    }));

  const fromLegacy: ChampionEntry[] = LEGACY_SEASONS.filter(
    // Skip any legacy season Sleeper already covers, so a season can't be double counted.
    (l) => !history.seasons.some((s) => s.season === l.season),
  ).map((l) => ({
    season: l.season,
    champion: l.championUserId ? history.managers[l.championUserId] ?? null : null,
    runnerUp: l.runnerUpUserId ? history.managers[l.runnerUpUserId] ?? null : null,
    platform: l.platform,
  }));

  return [...fromSleeper, ...fromLegacy].sort(
    (a, b) => Number(b.season) - Number(a.season),
  );
}

export interface ChampionshipCount {
  manager: Manager;
  titles: number;
  seasons: string[];
}

/** Career championship tally, most titles first. */
export function getChampionshipCounts(history: LeagueHistory): ChampionshipCount[] {
  const counts = new Map<string, ChampionshipCount>();
  for (const entry of getChampionHistory(history)) {
    if (!entry.champion) continue;
    const existing = counts.get(entry.champion.userId);
    if (existing) {
      existing.titles += 1;
      existing.seasons.push(entry.season);
    } else {
      counts.set(entry.champion.userId, {
        manager: entry.champion,
        titles: 1,
        seasons: [entry.season],
      });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.titles - a.titles);
}

/**
 * How many titles a manager has won, across Sleeper and pre-Sleeper
 * seasons. Single source of truth so every surface agrees.
 */
export function countTitles(history: LeagueHistory, userId: string): number {
  return getChampionHistory(history).filter((c) => c.champion?.userId === userId).length;
}
