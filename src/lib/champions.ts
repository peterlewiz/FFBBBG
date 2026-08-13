import type { LeagueHistory, Manager, SeasonData } from "./history";

export interface ChampionEntry {
  season: string;
  champion: Manager | null;
  runnerUp: Manager | null;
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

/** One entry per completed season that has a resolved champion, newest first. */
export function getChampionHistory(history: LeagueHistory): ChampionEntry[] {
  return history.seasons
    .filter((s) => s.status === "complete" && s.championRosterId !== null)
    .map((s) => ({
      season: s.season,
      champion: findManagerForRoster(s, history.managers, s.championRosterId),
      runnerUp: findManagerForRoster(s, history.managers, s.runnerUpRosterId),
    }))
    .reverse();
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
