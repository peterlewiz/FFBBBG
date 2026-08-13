import type { LeagueHistory, Manager, SeasonData } from "./history";
import { getChampionshipCounts } from "./champions";

export interface ManagerSeasonLine {
  season: string;
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  weeklyScores: number[]; // in week order
  madePlayoffs: boolean; // approximated: appeared in the winners bracket
}

/** Build, per manager, their stat line for every season they played. */
export function buildManagerSeasonLines(
  history: LeagueHistory,
): Record<string, ManagerSeasonLine[]> {
  const byManager: Record<string, ManagerSeasonLine[]> = {};

  for (const season of history.seasons) {
    const bracketRosterIds = new Set(
      (season.bracket ?? []).flatMap((m) => [m.t1, m.t2]).filter((x): x is number => x !== null),
    );

    for (const roster of season.rosters) {
      if (!roster.ownerUserId) continue;
      const weeklyScores = season.weeks
        .filter((w) => w.rosterId === roster.rosterId)
        .sort((a, b) => a.week - b.week)
        .map((w) => w.points);

      const line: ManagerSeasonLine = {
        season: season.season,
        rosterId: roster.rosterId,
        wins: roster.wins,
        losses: roster.losses,
        ties: roster.ties,
        pointsFor: roster.pointsFor,
        pointsAgainst: roster.pointsAgainst,
        weeklyScores,
        madePlayoffs: bracketRosterIds.has(roster.rosterId),
      };

      (byManager[roster.ownerUserId] ??= []).push(line);
    }
  }

  return byManager;
}

function minMaxNormalize(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return () => 0.5;
  return (v: number) => (v - min) / (max - min);
}

export interface SeasonPowerRankEntry {
  manager: Manager;
  rosterId: number;
  score: number; // 0-100
  winPct: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  momentum: number; // last-3-week avg minus season avg
}

/**
 * Power ranking for a single season: blends win % (45%), average points
 * scored (30%), average points allowed - inverted, as a schedule-strength /
 * bad-luck signal (15%), and recent (last 3 weeks) scoring momentum (10%).
 */
export function computeSeasonPowerRankings(
  season: SeasonData,
  managers: Record<string, Manager>,
): SeasonPowerRankEntry[] {
  const rows = season.rosters
    .filter((r) => r.ownerUserId && managers[r.ownerUserId])
    .map((r) => {
      const games = r.wins + r.losses + r.ties;
      const winPct = games > 0 ? (r.wins + r.ties * 0.5) / games : 0;
      const avgPointsFor = games > 0 ? r.pointsFor / games : 0;
      const avgPointsAgainst = games > 0 ? r.pointsAgainst / games : 0;

      const weeklyScores = season.weeks
        .filter((w) => w.rosterId === r.rosterId)
        .sort((a, b) => a.week - b.week)
        .map((w) => w.points);
      const last3 = weeklyScores.slice(-3);
      const last3Avg =
        last3.length > 0 ? last3.reduce((a, b) => a + b, 0) / last3.length : avgPointsFor;
      const momentum = last3Avg - avgPointsFor;

      return { r, winPct, avgPointsFor, avgPointsAgainst, momentum };
    });

  if (rows.length === 0) return [];

  const winPctNorm = minMaxNormalize(rows.map((x) => x.winPct));
  const pfNorm = minMaxNormalize(rows.map((x) => x.avgPointsFor));
  const paNorm = minMaxNormalize(rows.map((x) => x.avgPointsAgainst));
  const momentumNorm = minMaxNormalize(rows.map((x) => x.momentum));

  const entries = rows.map(({ r, winPct, avgPointsFor, avgPointsAgainst, momentum }) => {
    const score =
      100 *
      (0.45 * winPctNorm(winPct) +
        0.3 * pfNorm(avgPointsFor) +
        // Lower points-against is slightly favorable (tougher schedule endured well),
        // so invert the normalized value.
        0.15 * (1 - paNorm(avgPointsAgainst)) +
        0.1 * momentumNorm(momentum));

    return {
      manager: managers[r.ownerUserId as string],
      rosterId: r.rosterId,
      score: Math.round(score * 10) / 10,
      winPct,
      avgPointsFor,
      avgPointsAgainst,
      momentum,
    };
  });

  return entries.sort((a, b) => b.score - a.score);
}

export interface AllTimePowerRankEntry {
  manager: Manager;
  score: number; // 0-100
  seasonsPlayed: number;
  titles: number;
  playoffAppearances: number;
  careerWinPct: number;
  careerAvgPointsFor: number;
  avgSeasonPowerScore: number;
}

/**
 * All-time power ranking: rewards sustained success across every season -
 * championships, playoff appearances, career win rate, career scoring, and
 * average per-season power score - not just one good year.
 */
export function computeAllTimePowerRankings(
  history: LeagueHistory,
): AllTimePowerRankEntry[] {
  const seasonLines = buildManagerSeasonLines(history);
  const titleCounts = new Map(
    getChampionshipCounts(history).map((c) => [c.manager.userId, c.titles]),
  );

  const seasonPowerByUserRosterKey = new Map<string, number>();
  for (const season of history.seasons) {
    const ranked = computeSeasonPowerRankings(season, history.managers);
    for (const entry of ranked) {
      seasonPowerByUserRosterKey.set(`${entry.manager.userId}:${season.season}`, entry.score);
    }
  }

  const rows = Object.entries(seasonLines).map(([userId, lines]) => {
    const manager = history.managers[userId];
    const totalWins = lines.reduce((a, l) => a + l.wins, 0);
    const totalLosses = lines.reduce((a, l) => a + l.losses, 0);
    const totalTies = lines.reduce((a, l) => a + l.ties, 0);
    const games = totalWins + totalLosses + totalTies;
    const careerWinPct = games > 0 ? (totalWins + totalTies * 0.5) / games : 0;
    const careerAvgPointsFor =
      lines.reduce((a, l) => a + l.pointsFor, 0) /
      Math.max(1, lines.reduce((a, l) => a + l.wins + l.losses + l.ties, 0));
    const playoffAppearances = lines.filter((l) => l.madePlayoffs).length;
    const titles = titleCounts.get(userId) ?? 0;

    const seasonScores = lines.map(
      (l) => seasonPowerByUserRosterKey.get(`${userId}:${l.season}`) ?? 0,
    );
    const avgSeasonPowerScore =
      seasonScores.length > 0
        ? seasonScores.reduce((a, b) => a + b, 0) / seasonScores.length
        : 0;

    return {
      manager,
      seasonsPlayed: lines.length,
      titles,
      playoffAppearances,
      careerWinPct,
      careerAvgPointsFor,
      avgSeasonPowerScore,
    };
  });

  const winPctNorm = minMaxNormalize(rows.map((x) => x.careerWinPct));
  const pfNorm = minMaxNormalize(rows.map((x) => x.careerAvgPointsFor));
  const playoffRateNorm = minMaxNormalize(
    rows.map((x) => x.playoffAppearances / Math.max(1, x.seasonsPlayed)),
  );
  const avgPowerNorm = minMaxNormalize(rows.map((x) => x.avgSeasonPowerScore));

  const entries: AllTimePowerRankEntry[] = rows.map((row) => {
    const titleBonus = Math.min(row.titles * 8, 24); // capped so it can't totally dominate
    const score =
      100 *
        (0.3 * avgPowerNorm(row.avgSeasonPowerScore) +
          0.3 * winPctNorm(row.careerWinPct) +
          0.2 * playoffRateNorm(row.playoffAppearances / Math.max(1, row.seasonsPlayed)) +
          0.2 * pfNorm(row.careerAvgPointsFor)) *
        0.76 +
      titleBonus;

    return {
      manager: row.manager,
      score: Math.round(Math.min(score, 100) * 10) / 10,
      seasonsPlayed: row.seasonsPlayed,
      titles: row.titles,
      playoffAppearances: row.playoffAppearances,
      careerWinPct: row.careerWinPct,
      careerAvgPointsFor: row.careerAvgPointsFor,
      avgSeasonPowerScore: row.avgSeasonPowerScore,
    };
  });

  return entries.sort((a, b) => b.score - a.score);
}
