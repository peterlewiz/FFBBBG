import type { LeagueHistory, SeasonData } from "./history";
import type { EloResult } from "./elo";
import { winProbability } from "./elo";

const DEFAULT_SIMULATIONS = 10000;
// Generic fantasy-football weekly score if a manager has too little
// history to estimate their own distribution from (e.g. week 1 of their
// first season) - not meant to be precise, just plausible.
const DEFAULT_MEAN = 100;
const DEFAULT_STDEV = 22;
const MIN_SAMPLE_FOR_OWN_STATS = 3;

export interface PlayoffOddsEntry {
  userId: string;
  /** 0-1: fraction of simulations this manager made the playoff bracket. */
  playoffPct: number;
  /** 0-1: fraction of simulations this manager won it all. */
  titlePct: number;
  /** 0-1 per seed, index 0 = seed 1. Doesn't sum to playoffPct's complement
   * because a miss isn't a seed - it sums to playoffPct itself. */
  seedPct: number[];
}

export interface PlayoffOddsResult {
  season: string;
  /** Highest week with at least one played matchup, 0 before week 1. */
  asOfWeek: number;
  playoffTeams: number;
  simulations: number;
  /** Sorted by playoff odds desc, then title odds desc. */
  entries: PlayoffOddsEntry[];
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdevOf(values: number[], avg: number): number {
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
  // Floored so a freakishly consistent (or 1-game) sample never collapses
  // the simulated distribution to near-zero spread.
  return Math.max(Math.sqrt(variance), 5);
}

/**
 * A manager's own weekly-score distribution (mean, stdev), preferring
 * this season's games so far and falling back to their full career, then
 * a generic default - purely for drawing plausible simulated box scores
 * to break playoff ties on; win/loss itself comes from Elo, not this.
 */
function teamScoringStats(
  history: LeagueHistory,
  currentSeason: SeasonData,
  userId: string,
): { mean: number; stdev: number } {
  const ownRoster = currentSeason.rosters.find((r) => r.ownerUserId === userId);
  const thisSeason = ownRoster
    ? currentSeason.weeks
        .filter((w) => w.rosterId === ownRoster.rosterId && w.points > 0)
        .map((w) => w.points)
    : [];
  if (thisSeason.length >= MIN_SAMPLE_FOR_OWN_STATS) {
    const avg = mean(thisSeason);
    return { mean: avg, stdev: stdevOf(thisSeason, avg) };
  }

  const career: number[] = [];
  for (const season of history.seasons) {
    const r = season.rosters.find((r) => r.ownerUserId === userId);
    if (!r) continue;
    for (const w of season.weeks) {
      if (w.rosterId === r.rosterId && w.points > 0) career.push(w.points);
    }
  }
  if (career.length >= MIN_SAMPLE_FOR_OWN_STATS) {
    const avg = mean(career);
    return { mean: avg, stdev: stdevOf(career, avg) };
  }

  return { mean: DEFAULT_MEAN, stdev: DEFAULT_STDEV };
}

/** Box-Muller, cheap enough to call millions of times per odds computation. */
function gaussianRandom(avg: number, stdev: number, rand: () => number): number {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return avg + z * stdev;
}

/** This season's regular-season matchups that haven't been played yet. */
function remainingRegularSeasonMatchups(
  season: SeasonData,
): { week: number; rosterA: number; rosterB: number }[] {
  const lastRegularWeek = (season.playoffWeekStart ?? 1) - 1;
  const byWeek = new Map<number, SeasonData["weeks"]>();
  for (const w of season.weeks) {
    if (w.week > lastRegularWeek) continue;
    const arr = byWeek.get(w.week) ?? [];
    arr.push(w);
    byWeek.set(w.week, arr);
  }

  const out: { week: number; rosterA: number; rosterB: number }[] = [];
  for (const [week, rows] of byWeek) {
    const byMatchup = new Map<number, SeasonData["weeks"]>();
    for (const r of rows) {
      if (r.matchupId === null) continue;
      const arr = byMatchup.get(r.matchupId) ?? [];
      arr.push(r);
      byMatchup.set(r.matchupId, arr);
    }
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (a.points > 0 || b.points > 0) continue; // already played
      out.push({ week, rosterA: a.rosterId, rosterB: b.rosterId });
    }
  }
  return out;
}

/**
 * The fixed bracket-slot order for a single-elimination field of `p`
 * (a power of 2), e.g. seedOrder(8) = [1,8,4,5,2,7,3,6] - the standard
 * "1 vs 8, 4 vs 5 / 2 vs 7, 3 vs 6" tournament layout. Verified against
 * this league's real Sleeper winners_bracket: with 7 real teams padded
 * to 8, seed 1's round-1 "opponent" is the phantom 8, i.e. a bye - which
 * is exactly what Sleeper generates.
 */
function bracketSeedOrder(p: number): number[] {
  if (p === 1) return [1];
  const prev = bracketSeedOrder(p / 2);
  const out: number[] = [];
  for (const s of prev) out.push(s, p + 1 - s);
  return out;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Simulates one single-elimination bracket run from a list of playoff
 * teams' Elo ratings (index 0 = seed 1). Returns the champion's index
 * back into that same list.
 */
function simulateBracket(seedRatings: number[], rand: () => number): number {
  const n = seedRatings.length;
  const p = nextPowerOfTwo(n);
  let alive = bracketSeedOrder(p); // 1-indexed seed numbers; > n = phantom bye

  while (alive.length > 1) {
    const next: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const s1 = alive[i];
      const s2 = alive[i + 1];
      if (s1 > n) {
        next.push(s2);
        continue;
      }
      if (s2 > n) {
        next.push(s1);
        continue;
      }
      const probS1 = winProbability(seedRatings[s1 - 1], seedRatings[s2 - 1]);
      next.push(rand() < probS1 ? s1 : s2);
    }
    alive = next;
  }
  return alive[0] - 1;
}

function computeAsOfWeek(season: SeasonData): number {
  let max = 0;
  for (const w of season.weeks) {
    if (w.points > 0 && w.week > max) max = w.week;
  }
  return max;
}

interface SimTeam {
  userId: string;
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  rating: number;
  mean: number;
  stdev: number;
}

/**
 * The Monte Carlo core, shared by the real in-season simulation and the
 * preseason projection below - everything about *how* a season plays out
 * (Elo-driven win/loss, simulated box scores for seeding ties, bracket
 * structure) lives here. What differs between the two callers is only
 * *which* games get simulated and what each team's starting record is.
 */
function runMonteCarlo(
  teams: SimTeam[],
  matchups: { rosterA: number; rosterB: number }[],
  playoffTeamCount: number,
  simulations: number,
): PlayoffOddsEntry[] {
  const rosterIndex = new Map(teams.map((t, i) => [t.rosterId, i]));

  const playoffCount = new Array(teams.length).fill(0);
  const titleCount = new Array(teams.length).fill(0);
  const seedCount: number[][] = teams.map(() => new Array(playoffTeamCount).fill(0));

  for (let sim = 0; sim < simulations; sim++) {
    const wins = teams.map((t) => t.wins);
    const losses = teams.map((t) => t.losses);
    const ties = teams.map((t) => t.ties);
    const pointsFor = teams.map((t) => t.pointsFor);

    for (const m of matchups) {
      const iA = rosterIndex.get(m.rosterA);
      const iB = rosterIndex.get(m.rosterB);
      if (iA === undefined || iB === undefined) continue;
      const teamA = teams[iA];
      const teamB = teams[iB];

      const probA = winProbability(teamA.rating, teamB.rating);
      const aWins = Math.random() < probA;

      let scoreA = gaussianRandom(teamA.mean, teamA.stdev, Math.random);
      let scoreB = gaussianRandom(teamB.mean, teamB.stdev, Math.random);
      // Win/loss is Elo's call, not the drawn scores' - keep the box
      // score consistent with that instead of occasionally contradicting
      // it (a "loser" outscoring the "winner" that game).
      if (aWins !== scoreA > scoreB) [scoreA, scoreB] = [scoreB, scoreA];

      if (aWins) wins[iA]++;
      else wins[iB]++;
      if (aWins) losses[iB]++;
      else losses[iA]++;
      pointsFor[iA] += scoreA;
      pointsFor[iB] += scoreB;
    }

    const standings = teams
      .map((_t, i) => {
        const games = wins[i] + losses[i] + ties[i];
        const winPct = games > 0 ? (wins[i] + ties[i] * 0.5) / games : 0;
        return { i, winPct, pointsFor: pointsFor[i] };
      })
      .sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor);

    const seeded = standings.slice(0, playoffTeamCount);
    seeded.forEach((s, seedIdx) => {
      playoffCount[s.i]++;
      seedCount[s.i][seedIdx]++;
    });

    const seedRatings = seeded.map((s) => teams[s.i].rating);
    const championSeedIdx = simulateBracket(seedRatings, Math.random);
    titleCount[seeded[championSeedIdx].i]++;
  }

  const entries: PlayoffOddsEntry[] = teams.map((t, i) => ({
    userId: t.userId,
    playoffPct: playoffCount[i] / simulations,
    titlePct: titleCount[i] / simulations,
    seedPct: seedCount[i].map((c) => c / simulations),
  }));
  entries.sort((a, b) => b.playoffPct - a.playoffPct || b.titlePct - a.titlePct);
  return entries;
}

/**
 * Monte Carlo playoff odds for the current season: plays out the rest of
 * the regular season `simulations` times (win/loss from each matchup's
 * Elo win probability; simulated box scores, drawn from each manager's
 * own scoring distribution, only used to break playoff-seeding ties the
 * same way real standings do), seeds the resulting top-N field, and runs
 * the actual playoff bracket structure to a champion each time.
 *
 * Returns null if the current season doesn't have enough set up to
 * simulate yet (no draft/rosters, or playoff format not configured) -
 * see `simulatePreseasonProjection` for a fallback that doesn't need a
 * real schedule.
 */
export function simulatePlayoffOdds(
  history: LeagueHistory,
  eloResult: EloResult,
  simulations: number = DEFAULT_SIMULATIONS,
): PlayoffOddsResult | null {
  const season = history.seasons[history.seasons.length - 1];
  if (
    !season ||
    season.rosters.length === 0 ||
    // Rosters exist as soon as managers join for the season, well before
    // the schedule does - without a schedule there's nothing to simulate
    // and no real signal to seed a field from (every team would tie at
    // 0-0-0, resolved only by array order, which looks like real odds
    // but is meaningless noise).
    season.weeks.length === 0 ||
    !season.playoffWeekStart ||
    !season.playoffTeams
  ) {
    return null;
  }
  const playoffTeamCount = season.playoffTeams;

  const teams: SimTeam[] = season.rosters
    .filter((r) => r.ownerUserId && history.managers[r.ownerUserId])
    .map((r) => {
      const userId = r.ownerUserId as string;
      const stats = teamScoringStats(history, season, userId);
      return {
        userId,
        rosterId: r.rosterId,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        pointsFor: r.pointsFor,
        rating: eloResult.ratings[userId] ?? 1500,
        mean: stats.mean,
        stdev: stats.stdev,
      };
    });

  if (teams.length < playoffTeamCount) return null;

  const remaining = remainingRegularSeasonMatchups(season);
  const entries = runMonteCarlo(teams, remaining, playoffTeamCount, simulations);

  return {
    season: season.season,
    asOfWeek: computeAsOfWeek(season),
    playoffTeams: playoffTeamCount,
    simulations,
    entries,
  };
}

export interface PreseasonProjectionResult {
  season: string;
  playoffTeams: number;
  simulations: number;
  entries: PlayoffOddsEntry[];
}

/** Every team plays every other team once - a stand-in for a real
 * schedule that doesn't exist yet. */
function roundRobinPairs(rosterIds: number[]): { rosterA: number; rosterB: number }[] {
  const out: { rosterA: number; rosterB: number }[] = [];
  for (let i = 0; i < rosterIds.length; i++) {
    for (let j = i + 1; j < rosterIds.length; j++) {
      out.push({ rosterA: rosterIds[i], rosterB: rosterIds[j] });
    }
  }
  return out;
}

/**
 * A preseason projection for when there's no real schedule to simulate
 * yet (before the draft): this year's field of managers, ranked purely
 * on career Elo (built from every previous season) and each manager's
 * career scoring distribution, playing a hypothetical round-robin.
 * There's no real strength-of-schedule signal to use since the actual
 * schedule doesn't exist, so this is a rating-only projection, not a
 * substitute for `simulatePlayoffOdds` once the season actually starts.
 */
export function simulatePreseasonProjection(
  history: LeagueHistory,
  eloResult: EloResult,
  simulations: number = DEFAULT_SIMULATIONS,
): PreseasonProjectionResult | null {
  const season = history.seasons[history.seasons.length - 1];
  if (!season || season.rosters.length === 0 || !season.playoffTeams) return null;
  const playoffTeamCount = season.playoffTeams;

  const teams: SimTeam[] = season.rosters
    .filter((r) => r.ownerUserId && history.managers[r.ownerUserId])
    .map((r) => {
      const userId = r.ownerUserId as string;
      // No season-to-date games exist yet, so this always falls back to
      // the manager's career distribution (or the generic default for
      // someone brand new to the league).
      const stats = teamScoringStats(history, season, userId);
      return {
        userId,
        rosterId: r.rosterId,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        rating: eloResult.ratings[userId] ?? 1500,
        mean: stats.mean,
        stdev: stats.stdev,
      };
    });

  if (teams.length < playoffTeamCount) return null;

  const matchups = roundRobinPairs(teams.map((t) => t.rosterId));
  const entries = runMonteCarlo(teams, matchups, playoffTeamCount, simulations);

  return { season: season.season, playoffTeams: playoffTeamCount, simulations, entries };
}
