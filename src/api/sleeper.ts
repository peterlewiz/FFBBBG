import type {
  SleeperBracketMatch,
  SleeperLeague,
  SleeperMatchup,
  SleeperDraft,
  SleeperDraftPick,
  SleeperNflState,
  SleeperPlayer,
  SleeperRoster,
  SleeperUser,
} from "./types";

const BASE = "https://api.sleeper.app/v1";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Sleeper API request failed: ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function getLeague(leagueId: string): Promise<SleeperLeague> {
  return getJson(`/league/${leagueId}`);
}

export function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  return getJson(`/league/${leagueId}/users`);
}

export function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  return getJson(`/league/${leagueId}/rosters`);
}

export function getMatchups(
  leagueId: string,
  week: number,
): Promise<SleeperMatchup[]> {
  return getJson(`/league/${leagueId}/matchups/${week}`);
}

export function getWinnersBracket(
  leagueId: string,
): Promise<SleeperBracketMatch[]> {
  return getJson(`/league/${leagueId}/winners_bracket`);
}

/**
 * The "toilet bowl" bracket that decides actual last place. Same shape as
 * the winners bracket, but placements count up from the bottom - the p:1
 * match is the last-place game, and its loser is the true sacko.
 */
export function getLosersBracket(
  leagueId: string,
): Promise<SleeperBracketMatch[]> {
  return getJson(`/league/${leagueId}/losers_bracket`);
}

/** The current NFL week, per Sleeper's own clock - not league-specific. */
export function getNflState(): Promise<SleeperNflState> {
  return getJson(`/state/nfl`);
}

/** Draft details, including the commissioner-set start time. */
export function getDraft(draftId: string): Promise<SleeperDraft> {
  return getJson(`/draft/${draftId}`);
}

/** Picks made so far in a live/completed draft - [] before it starts. */
export function getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
  return getJson(`/draft/${draftId}/picks`);
}

/**
 * Every player Sleeper has ever tracked (~15MB, ~12k entries, most of
 * them irrelevant) - Sleeper's own docs ask that this only be fetched
 * about once a day, not on every page load. Callers should cache a
 * trimmed-down result, not this raw payload.
 */
export function getAllPlayers(): Promise<Record<string, SleeperPlayer>> {
  return getJson(`/players/nfl`);
}

const MAX_REGULAR_SEASON_PLUS_PLAYOFF_WEEKS = 18;

/**
 * Fetch every week's matchups for a season (weeks 1-18, in parallel), and
 * drop any weeks that haven't happened yet (Sleeper returns []).
 * Returns { week, matchups } pairs sorted by week, so gaps don't shift
 * later weeks' indices.
 */
export async function getAllMatchupsForSeason(
  leagueId: string,
): Promise<{ week: number; matchups: SleeperMatchup[] }[]> {
  const weekNumbers = Array.from(
    { length: MAX_REGULAR_SEASON_PLUS_PLAYOFF_WEEKS },
    (_, i) => i + 1,
  );
  const results = await Promise.all(
    weekNumbers.map(async (week) => ({
      week,
      matchups: await getMatchups(leagueId, week),
    })),
  );
  return results.filter((r) => r.matchups && r.matchups.length > 0);
}

/** A player's raw stat line for a week or a whole season - Sleeper's own
 * stat codes ("pass_yd", "rec", "fgm_40_49", ...), the same keys a
 * league's scoring_settings is written in, which is what lets a stat
 * line be scored in this league's exact rules rather than a generic
 * preset. `gp` is games played, present on season totals. */
export type SleeperStatLine = Record<string, number>;

/** Season totals per player. One request covers a whole season, where
 * the per-week endpoint would need eighteen. */
export function getSeasonStats(season: string): Promise<Record<string, SleeperStatLine>> {
  return getJson(`/stats/nfl/regular/${season}`);
}

export function getWeekStats(
  season: string,
  week: number,
): Promise<Record<string, SleeperStatLine>> {
  return getJson(`/stats/nfl/regular/${season}/${week}`);
}

export interface SleeperScheduleGame {
  week: number;
  home: string;
  away: string;
  date: string;
  status: string;
}

/**
 * The NFL season's fixture list. Not under /v1 like everything else.
 * Used to work out bye weeks: a team that doesn't appear in a week's
 * fixtures isn't playing that week.
 */
export async function getNflSchedule(season: string): Promise<SleeperScheduleGame[]> {
  const res = await fetch(`https://api.sleeper.app/schedule/nfl/regular/${season}`);
  if (!res.ok) throw new Error(`Sleeper schedule request failed (${res.status})`);
  return res.json() as Promise<SleeperScheduleGame[]>;
}

/** One player's projected stat line for a week, from Sleeper's own
 * projections. `stats` uses the same stat codes as real results, so a
 * projection can be scored in a league's own rules rather than taken as
 * Sleeper's generic pts_half_ppr. */
export interface SleeperProjection {
  player_id: string;
  stats: Record<string, number> | null;
}

/**
 * Sleeper's weekly projections. Not under /v1, and needs every position
 * listed explicitly or it returns only the default set.
 */
export async function getWeeklyProjections(
  season: string,
  week: number,
): Promise<SleeperProjection[]> {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"]
    .map((p) => `position[]=${p}`)
    .join("&");
  const res = await fetch(
    `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${positions}&order_by=ppr`,
  );
  if (!res.ok) throw new Error(`Sleeper projections request failed (${res.status})`);
  return res.json() as Promise<SleeperProjection[]>;
}
