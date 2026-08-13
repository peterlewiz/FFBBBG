import type {
  SleeperBracketMatch,
  SleeperLeague,
  SleeperMatchup,
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
