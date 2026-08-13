import { cacheGet, cacheSet } from "../api/cache";
import {
  getAllMatchupsForSeason,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getWinnersBracket,
} from "../api/sleeper";
import type { SleeperBracketMatch, SleeperMatchup } from "../api/types";

export const ROOT_LEAGUE_ID = "1389753876558680064";

export interface Manager {
  /** Sleeper user_id - stable across seasons even if team name changes. */
  userId: string;
  displayName: string;
  teamName: string;
  avatar: string | null;
}

export interface WeekMatchup {
  week: number;
  matchupId: number | null;
  rosterId: number;
  points: number;
}

export interface SeasonRoster {
  rosterId: number;
  ownerUserId: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface SeasonData {
  leagueId: string;
  season: string;
  status: string;
  playoffWeekStart: number | null;
  rosters: SeasonRoster[];
  weeks: WeekMatchup[]; // flattened, all weeks
  bracket: SleeperBracketMatch[] | null;
  championRosterId: number | null;
  runnerUpRosterId: number | null;
}

export interface LeagueHistory {
  managers: Record<string, Manager>; // userId -> Manager
  seasons: SeasonData[]; // sorted oldest -> newest
}

function combineFptsFields(whole: number, decimal?: number): number {
  return whole + (decimal ?? 0) / 100;
}

async function loadSeason(leagueId: string): Promise<{
  season: SeasonData;
  users: Awaited<ReturnType<typeof getLeagueUsers>>;
  previousLeagueId: string | null;
}> {
  const [league, users, rosters] = await Promise.all([
    getLeague(leagueId),
    getLeagueUsers(leagueId),
    getLeagueRosters(leagueId),
  ]);

  const hasStarted = league.status !== "pre_draft" && league.status !== "drafting";

  const [weekResults, bracket] = await Promise.all([
    hasStarted ? getAllMatchupsForSeason(leagueId) : Promise.resolve([]),
    league.status === "complete"
      ? getWinnersBracket(leagueId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const weeks: WeekMatchup[] = weekResults.flatMap(({ week, matchups }) =>
    (matchups as SleeperMatchup[]).map((m) => ({
      week,
      matchupId: m.matchup_id,
      rosterId: m.roster_id,
      points: m.points ?? 0,
    })),
  );

  const seasonRosters: SeasonRoster[] = rosters.map((r) => ({
    rosterId: r.roster_id,
    ownerUserId: r.owner_id,
    wins: r.settings.wins ?? 0,
    losses: r.settings.losses ?? 0,
    ties: r.settings.ties ?? 0,
    pointsFor: combineFptsFields(r.settings.fpts ?? 0, r.settings.fpts_decimal),
    pointsAgainst: combineFptsFields(
      r.settings.fpts_against ?? 0,
      r.settings.fpts_against_decimal,
    ),
  }));

  let championRosterId: number | null = null;
  let runnerUpRosterId: number | null = null;
  if (bracket) {
    const finalMatch = bracket.find((m) => m.p === 1);
    if (finalMatch) {
      championRosterId = finalMatch.w ?? null;
      runnerUpRosterId = finalMatch.l ?? null;
    }
  }

  return {
    season: {
      leagueId,
      season: league.season,
      status: league.status,
      playoffWeekStart: league.settings.playoff_week_start ?? null,
      rosters: seasonRosters,
      weeks,
      bracket,
      championRosterId,
      runnerUpRosterId,
    },
    users,
    previousLeagueId: league.previous_league_id,
  };
}

/**
 * Walk the previous_league_id chain from the given league backward through
 * every prior season, fetching each season's rosters/matchups/bracket along
 * the way. Cached in localStorage so repeat visits are instant.
 */
export async function loadLeagueHistory(
  rootLeagueId: string = ROOT_LEAGUE_ID,
): Promise<LeagueHistory> {
  const cacheKey = `history:${rootLeagueId}`;
  const cached = cacheGet<LeagueHistory>(cacheKey);
  if (cached) return cached;

  const seasons: SeasonData[] = [];
  const managers: Record<string, Manager> = {};

  let currentId: string | null = rootLeagueId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const { season, users, previousLeagueId } = await loadSeason(currentId);
    seasons.push(season);

    for (const u of users) {
      // Keep the most recent display/team name we've seen for each manager.
      managers[u.user_id] = {
        userId: u.user_id,
        displayName: u.display_name,
        teamName: u.metadata?.team_name || u.display_name,
        avatar: u.avatar,
      };
    }

    currentId = previousLeagueId;
  }

  seasons.sort((a, b) => Number(a.season) - Number(b.season));

  const history: LeagueHistory = { managers, seasons };
  cacheSet(cacheKey, history);
  return history;
}
