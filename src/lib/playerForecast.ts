import {
  getNflSchedule,
  getSeasonStats,
  getWeeklyProjections,
  getWeekStats,
  type SleeperStatLine,
} from "../api/sleeper";
import { cacheGet, cacheSet } from "../api/cache";
import type { DraftPlayer, FantasyPosition } from "./players";

/**
 * How much last season's per-game average counts, expressed in games of
 * this season. Four is deliberately modest: a year-old average is real
 * evidence about a player, but rookies, new roles and new teams make it
 * a weaker guide than a month of current football.
 */
const PRIOR_WEIGHT_GAMES = 4;

/**
 * Each week back counts this much less than the one after it, so a
 * player who has taken over a starting job is judged mostly on the
 * weeks since, not on the games he spent behind someone.
 */
const RECENCY_DECAY = 0.85;

/**
 * Evidence-equivalent of the positional baseline, which every player is
 * pulled towards. It's what stops one 30-point week from making a
 * waiver-wire flier the best projection on the board.
 */
const BASELINE_WEIGHT_GAMES = 2;

/** Injury tags that mean no points at all. Sleeper's exact strings. */
const OUT_STATUSES = new Set(["Out", "IR", "Doubtful", "PUP", "Suspended", "NA", "Sus"]);
/** A questionable player usually plays, but often enough sits or leaves
 * early that a full projection would be optimistic. */
const QUESTIONABLE_FACTOR = 0.85;

/**
 * Applies a league's own scoring rules to a raw stat line.
 *
 * This is the reason the forecast is built from stat lines rather than
 * Sleeper's ready-made `pts_half_ppr`: this league isn't standard half
 * PPR. It pays 0.1 per carry, 0.04 per passing yard and 4 per passing
 * touchdown, so Sleeper's generic number is wrong for it - Joe Burrow's
 * week 1 was 15.16 by Sleeper's preset and 14.66 by this league's actual
 * rules. Scoring the stats directly is exact by construction, whatever
 * the commissioner changes.
 */
export function scoreStatLine(stats: SleeperStatLine, scoring: Record<string, number>): number {
  let points = 0;
  for (const [stat, weight] of Object.entries(scoring)) {
    if (weight === 0) continue;
    const value = stats[stat];
    if (typeof value === "number") points += value * weight;
  }
  return points;
}

/** The two independent reads that make up a player's number. Sleeper's
 * is null for anyone it doesn't expect to play. */
export interface ForecastSources {
  /** This app's own model: past games, scored in league rules. */
  own: number | null;
  /** Sleeper's weekly projection, re-scored in league rules. */
  sleeper: number | null;
}

export interface PlayerForecast {
  points: number;
  /** What each source said before they were averaged. */
  sources: ForecastSources;
  /** Games of this season that fed the estimate. */
  gamesUsed: number;
  /** Where the number mostly came from, for explaining it in the UI. */
  basis: "form" | "prior" | "baseline";
  onBye: boolean;
  out: boolean;
  questionable: boolean;
}

interface WeekScores {
  week: number;
  /** playerId -> points in this league's scoring */
  points: Map<string, number>;
}

export interface ForecastModel {
  /** Predict a player's points for the target week. */
  predict: (player: DraftPlayer) => PlayerForecast;
  targetWeek: number;
  /** Completed weeks of this season the model learned from. */
  weeksLearned: number[];
  /** Teams on bye in the target week. */
  byeTeams: string[];
}

/** Per-game averages from a whole season's totals. */
function perGameFromSeason(
  season: Record<string, SleeperStatLine>,
  scoring: Record<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [playerId, stats] of Object.entries(season)) {
    const games = stats.gp;
    if (typeof games !== "number" || games < 1) continue;
    out.set(playerId, scoreStatLine(stats, scoring) / games);
  }
  return out;
}

/**
 * A median rather than a mean, because the tail of a position is enormous
 * - thousands of players with a single snap - and a mean over everyone
 * who ever appeared would sit far below what a startable player scores.
 * Only players who actually started are counted for the same reason.
 */
function positionBaselines(
  players: DraftPlayer[],
  perGame: Map<string, number>,
): Record<string, number> {
  const byPosition: Record<string, number[]> = {};
  for (const player of players) {
    const avg = perGame.get(player.id);
    if (avg === undefined || avg <= 0) continue;
    (byPosition[player.position] ??= []).push(avg);
  }
  const out: Record<string, number> = {};
  for (const [position, values] of Object.entries(byPosition)) {
    values.sort((a, b) => a - b);
    // The upper half of a position is roughly the startable half, and
    // its median is a fair "replacement starter" week.
    const upper = values.slice(Math.floor(values.length / 2));
    out[position] = upper.length > 0 ? upper[Math.floor(upper.length / 2)] : 0;
  }
  return out;
}

const FALLBACK_BASELINE: Record<FantasyPosition, number> = {
  QB: 15,
  RB: 8,
  WR: 8,
  TE: 5,
  K: 8,
  DEF: 6,
};

/**
 * Builds a weekly points forecast for every player, from Sleeper data
 * alone: past stat lines scored in this league's own rules, weighted
 * towards recent weeks, anchored by last season and by what a typical
 * starter at the position scores.
 *
 * Nothing here comes from an outside projection service. The advantage
 * is that it's scored in this league's actual rules and can be explained
 * player by player; the cost is that it has no idea who anyone plays
 * this week, so it's a read on form, not on matchup.
 */
export async function buildForecastModel({
  season,
  targetWeek,
  scoring,
  players,
}: {
  season: string;
  targetWeek: number;
  scoring: Record<string, number>;
  players: DraftPlayer[];
}): Promise<ForecastModel> {
  const previousSeason = String(Number(season) - 1);

  // Completed weeks only - the target week hasn't happened, and a week
  // in progress would count partial games as if they were finished.
  const completedWeeks = Array.from({ length: Math.max(0, targetWeek - 1) }, (_, i) => i + 1);

  // Only the stats this league actually pays for, plus games played.
  // The raw payloads are over a megabyte each, nearly all of it stat
  // codes scored at zero here; trimming first is what lets them be
  // cached at all rather than blowing the localStorage quota.
  const keep = new Set(
    Object.entries(scoring)
      .filter(([, weight]) => weight !== 0)
      .map(([stat]) => stat),
  );
  keep.add("gp");

  const [priorSeason, schedule, sleeperProjections, ...weekStats] = await Promise.all([
    cachedSeasonStats(previousSeason, keep),
    cachedSchedule(season),
    cachedSleeperProjections(season, targetWeek, scoring),
    ...completedWeeks.map((week) => cachedWeekStats(season, week, keep)),
  ]);

  const priorPerGame = perGameFromSeason(priorSeason, scoring);
  const weeks: WeekScores[] = weekStats.map((stats, i) => {
    const points = new Map<string, number>();
    for (const [playerId, line] of Object.entries(stats)) {
      // gp of 0 means on the roster but didn't play - that's a genuine
      // zero for fantasy purposes only if they were expected to play,
      // and we can't tell, so those weeks are skipped rather than
      // dragging an average down for someone who was inactive.
      if (line.gp === 0) continue;
      points.set(playerId, scoreStatLine(line, scoring));
    }
    return { week: completedWeeks[i], points };
  });

  const baselines = positionBaselines(players, priorPerGame);
  const byeTeams = byeTeamsForWeek(schedule, targetWeek, players);

  function predict(player: DraftPlayer): PlayerForecast {
    const onBye = player.team !== null && byeTeams.includes(player.team);
    const out = !!player.injuryStatus && OUT_STATUSES.has(player.injuryStatus);
    const questionable = player.injuryStatus === "Questionable";
    const baseline = baselines[player.position] ?? FALLBACK_BASELINE[player.position] ?? 0;

    let weighted = 0;
    let weight = 0;
    let gamesUsed = 0;
    for (const { week, points } of weeks) {
      const scored = points.get(player.id);
      if (scored === undefined) continue;
      const w = RECENCY_DECAY ** (targetWeek - week - 1);
      weighted += scored * w;
      weight += w;
      gamesUsed++;
    }

    const prior = priorPerGame.get(player.id);
    if (prior !== undefined) {
      weighted += prior * PRIOR_WEIGHT_GAMES;
      weight += PRIOR_WEIGHT_GAMES;
    }
    weighted += baseline * BASELINE_WEIGHT_GAMES;
    weight += BASELINE_WEIGHT_GAMES;

    const own = weight > 0 ? weighted / weight : baseline;
    const basis = gamesUsed > 0 ? "form" : prior !== undefined ? "prior" : "baseline";

    const sources: ForecastSources = {
      own,
      sleeper: sleeperProjections.get(player.id) ?? null,
    };

    // A straight average of whatever covers this player. The two lean
    // opposite ways - the model is backward-looking, built from games
    // already played, while Sleeper's projection is a forward read on
    // this week - so averaging stops either one being wrong on its own.
    const available = [sources.own, sources.sleeper].filter((v): v is number => v !== null);
    const raw = available.length > 0 ? available.reduce((a, b) => a + b, 0) / available.length : 0;

    let points = raw;
    if (onBye || out) points = 0;
    else if (questionable) points = raw * QUESTIONABLE_FACTOR;

    return { points, sources, gamesUsed, basis, onBye, out, questionable };
  }

  return { predict, targetWeek, weeksLearned: completedWeeks, byeTeams };
}

/**
 * Teams with no fixture in a week are on bye. Derived from the schedule
 * rather than carried on the player record, so it needs no outside data
 * and stays right if the league's season ever shifts.
 */
function byeTeamsForWeek(
  schedule: { week: number; home: string; away: string }[],
  week: number,
  players: DraftPlayer[],
): string[] {
  const games = schedule.filter((g) => g.week === week);
  // No fixtures at all for the week means the schedule doesn't cover it
  // (a playoff week, say) - claiming all 32 teams are on bye would zero
  // every lineup in the league.
  if (games.length === 0) return [];
  const playing = new Set<string>();
  for (const game of games) {
    playing.add(game.home);
    playing.add(game.away);
  }
  const allTeams = new Set(players.map((p) => p.team).filter((t): t is string => !!t));
  return [...allTeams].filter((team) => !playing.has(team));
}

// Stats for a finished season or a finished week never change, so these
// are cached hard. Only the raw payloads are large; what's stored is the
// same shape but read once per day at most.
const SEASON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WEEK_TTL_MS = 24 * 60 * 60 * 1000;

/** Drops every stat this league scores at zero, and every player whose
 * remaining line is empty - which is most of the ~8k entries. */
function trimStats(
  raw: Record<string, SleeperStatLine>,
  keep: Set<string>,
): Record<string, SleeperStatLine> {
  const out: Record<string, SleeperStatLine> = {};
  for (const [playerId, line] of Object.entries(raw)) {
    const kept: SleeperStatLine = {};
    let any = false;
    for (const [stat, value] of Object.entries(line)) {
      if (!keep.has(stat) || typeof value !== "number") continue;
      kept[stat] = value;
      any = true;
    }
    if (any) out[playerId] = kept;
  }
  return out;
}

async function cachedSeasonStats(
  season: string,
  keep: Set<string>,
): Promise<Record<string, SleeperStatLine>> {
  const key = `stats:season:${season}:v1`;
  const hit = cacheGet<Record<string, SleeperStatLine>>(key);
  if (hit) return hit;
  const data = trimStats(await getSeasonStats(season).catch(() => ({})), keep);
  cacheSet(key, data, SEASON_TTL_MS);
  return data;
}

async function cachedWeekStats(
  season: string,
  week: number,
  keep: Set<string>,
): Promise<Record<string, SleeperStatLine>> {
  const key = `stats:week:${season}:${week}:v1`;
  const hit = cacheGet<Record<string, SleeperStatLine>>(key);
  if (hit) return hit;
  const data = trimStats(await getWeekStats(season, week).catch(() => ({})), keep);
  cacheSet(key, data, WEEK_TTL_MS);
  return data;
}

async function cachedSchedule(season: string) {
  const key = `schedule:${season}:v1`;
  const hit = cacheGet<{ week: number; home: string; away: string }[]>(key);
  if (hit) return hit;
  const data = await getNflSchedule(season).catch(() => []);
  cacheSet(key, data, SEASON_TTL_MS);
  return data;
}

/**
 * Sleeper's weekly projections, scored in this league's rules and
 * reduced to one number per player before caching - the raw payload is
 * about two megabytes of stat lines, nearly all of it irrelevant here.
 *
 * Cached for three hours rather than a day: unlike a finished week's
 * results, a projection moves during the week as news lands.
 */
const PROJECTION_TTL_MS = 3 * 60 * 60 * 1000;

async function cachedSleeperProjections(
  season: string,
  week: number,
  scoring: Record<string, number>,
): Promise<Map<string, number>> {
  const key = `proj:sleeper:${season}:${week}:v1`;
  const hit = cacheGet<Record<string, number>>(key);
  if (hit) return new Map(Object.entries(hit));

  const raw = await getWeeklyProjections(season, week).catch(() => []);
  const scored: Record<string, number> = {};
  for (const entry of raw) {
    if (!entry.stats) continue;
    // Sleeper lists every player, most with nothing but an ADP field.
    // Only a real projected line is a projection.
    if (typeof entry.stats.pts_half_ppr !== "number") continue;
    scored[entry.player_id] = scoreStatLine(entry.stats, scoring);
  }
  cacheSet(key, scored, PROJECTION_TTL_MS);
  return new Map(Object.entries(scored));
}
