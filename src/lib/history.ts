import { cacheGet, cacheSet } from "../api/cache";
import {
  getAllMatchupsForSeason,
  getDraft,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLosersBracket,
  getWinnersBracket,
} from "../api/sleeper";
import type { SleeperBracketMatch, SleeperMatchup } from "../api/types";

export const ROOT_LEAGUE_ID = "1389753876558680064";

export interface Manager {
  /** Sleeper user_id - stable across seasons even if team name changes. */
  userId: string;
  /** Sleeper username - stable, unlike team name which managers rename yearly. */
  displayName: string;
  /** Most recent season's team name (falls back to username if never set). */
  teamName: string;
  avatar: string | null;
  /** Team name for each season this manager played, keyed by season year. */
  teamNameBySeason: Record<string, string>;
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
  /**
   * Loser of the losers-bracket's last-place game - i.e. actual dead
   * last, which the playoffs (or "toilet bowl") can reorder away from
   * regular-season record. Null if the league didn't run one that season.
   */
  sackoRosterId: number | null;
}

export interface LeagueHistory {
  managers: Record<string, Manager>; // userId -> Manager
  seasons: SeasonData[]; // sorted oldest -> newest
  /** Current season's league name and logo id, straight from Sleeper. */
  leagueName: string;
  leagueAvatar: string | null;
  /**
   * Scheduled draft start for the current season (epoch ms), as set by
   * the commissioner in Sleeper. Null if no date is set yet.
   */
  draftStartTime: number | null;
}

function combineFptsFields(whole: number, decimal?: number): number {
  return whole + (decimal ?? 0) / 100;
}

async function loadSeason(leagueId: string): Promise<{
  season: SeasonData;
  users: Awaited<ReturnType<typeof getLeagueUsers>>;
  previousLeagueId: string | null;
  league: Awaited<ReturnType<typeof getLeague>>;
}> {
  const [league, users, rosters] = await Promise.all([
    getLeague(leagueId),
    getLeagueUsers(leagueId),
    getLeagueRosters(leagueId),
  ]);

  const hasStarted = league.status !== "pre_draft" && league.status !== "drafting";

  const [weekResults, bracket, losersBracket] = await Promise.all([
    hasStarted ? getAllMatchupsForSeason(leagueId) : Promise.resolve([]),
    league.status === "complete"
      ? getWinnersBracket(leagueId).catch(() => null)
      : Promise.resolve(null),
    league.status === "complete"
      ? getLosersBracket(leagueId).catch(() => null)
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

  // The losers bracket's p:1 match is the last-place game - its loser
  // (not its winner) is the one who actually finishes dead last.
  let sackoRosterId: number | null = null;
  if (losersBracket) {
    const lastPlaceMatch = losersBracket.find((m) => m.p === 1);
    if (lastPlaceMatch) {
      sackoRosterId = lastPlaceMatch.l ?? null;
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
      sackoRosterId,
    },
    users,
    previousLeagueId: league.previous_league_id,
    league,
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
  // Captured from the first (newest) league in the chain.
  let currentLeague: Awaited<ReturnType<typeof getLeague>> | null = null;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const { season, users, previousLeagueId, league } = await loadSeason(currentId);
    if (!currentLeague) currentLeague = league;
    seasons.push(season);

    for (const u of users) {
      const teamNameThisSeason = u.metadata?.team_name || u.display_name;
      const existing = managers[u.user_id];
      if (existing) {
        // We walk newest -> oldest, so only backfill this season's team
        // name; never overwrite displayName/avatar/teamName, which were
        // already set from a more recent season.
        existing.teamNameBySeason[season.season] = teamNameThisSeason;
      } else {
        managers[u.user_id] = {
          userId: u.user_id,
          displayName: u.display_name,
          teamName: teamNameThisSeason,
          avatar: u.avatar,
          teamNameBySeason: { [season.season]: teamNameThisSeason },
        };
      }
    }

    currentId = previousLeagueId;
  }

  seasons.sort((a, b) => Number(a.season) - Number(b.season));

  // The commissioner's scheduled draft time, straight from Sleeper rather
  // than hardcoded. Non-fatal if it fails - the countdown just falls back.
  let draftStartTime: number | null = null;
  if (currentLeague?.draft_id) {
    const draft = await getDraft(currentLeague.draft_id).catch(() => null);
    draftStartTime = draft?.start_time ?? null;
  }

  const history: LeagueHistory = {
    managers,
    seasons,
    leagueName: currentLeague?.name ?? "",
    leagueAvatar: currentLeague?.avatar ?? null,
    draftStartTime,
  };
  cacheSet(cacheKey, history);
  return history;
}
