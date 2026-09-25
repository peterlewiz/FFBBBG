import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLeague,
  getLeagueRosters,
  getMatchups,
  getNflSchedule,
  type SleeperScheduleGame,
} from "../api/sleeper";
import { loadDraftPlayerPool } from "./players";
import { cacheGet, cacheSet } from "../api/cache";

/**
 * How often the scoreboard re-reads Sleeper.
 *
 * Thirty seconds during games: fantasy points settle a beat behind the
 * play anyway, so anything faster is requests spent watching a number
 * that hasn't moved. Polling stops entirely once every game in the week
 * is final - there is nothing left to update.
 */
const POLL_MS = 30_000;

/**
 * Kickoff times and final whistles move a game's status a handful of
 * times a day, so the fixture list is worth re-reading during a long
 * Sunday - but not on every 30-second tick, which would be 27KB a poll
 * to learn nothing.
 */
const SCHEDULE_TTL_MS = 5 * 60 * 1000;

export async function cachedSchedule(season: string): Promise<SleeperScheduleGame[]> {
  const key = `schedule:live:${season}:v1`;
  const hit = cacheGet<SleeperScheduleGame[]>(key);
  if (hit) return hit;
  const data = await getNflSchedule(season).catch(() => []);
  cacheSet(key, data, SCHEDULE_TTL_MS);
  return data;
}

/** Where a player's real-life game is up to, which is what separates
 * "scored 4 points" from "hasn't kicked off yet". */
export type GameState = "pre" | "live" | "final" | "bye";

export interface LiveStarter {
  /** Lineup slot - "QB", "FLEX", ... */
  slot: string;
  name: string | null;
  position: string | null;
  team: string | null;
  points: number;
  gameState: GameState;
}

export interface LiveTeam {
  rosterId: number;
  ownerUserId: string | null;
  points: number;
  /** What the bench scored - the number that stings on a Monday. */
  benchPoints: number;
  starters: LiveStarter[];
  /** Starters whose game hasn't kicked off yet. */
  yetToPlay: number;
}

export interface LiveMatchup {
  matchupId: number;
  a: LiveTeam;
  b: LiveTeam;
}

export interface LiveScoresState {
  matchups: LiveMatchup[];
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  refreshing: boolean;
  /** True once every game in the week is final. */
  weekComplete: boolean;
  refresh: () => void;
}

function gameStateFor(
  team: string | null,
  games: SleeperScheduleGame[],
): GameState {
  if (!team) return "pre";
  const game = games.find((g) => g.home === team || g.away === team);
  // A team with no fixture this week is on bye. Only trust that when the
  // week has fixtures at all - an empty schedule would otherwise read as
  // every team being on bye.
  if (!game) return games.length > 0 ? "bye" : "pre";
  if (game.status === "complete") return "final";
  if (game.status === "pre_game") return "pre";
  return "live";
}

/**
 * Every matchup in a week with live scoring, from Sleeper's matchup rows.
 *
 * Those rows carry `starters_points` alongside `starters`, so each slot's
 * live total comes straight from Sleeper rather than being recomputed
 * here - no chance of this page and the Sleeper app disagreeing about
 * what someone has scored.
 */
export function useLiveScores(leagueId: string, week: number | null): LiveScoresState {
  const [state, setState] = useState<Omit<LiveScoresState, "refresh">>({
    matchups: [],
    loading: true,
    error: null,
    updatedAt: null,
    refreshing: false,
    weekComplete: false,
  });
  // Recursive setTimeout rather than setInterval, so a slow response
  // can't stack overlapping reads.
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (week === null) return;
    const targetWeek = week;

    function schedule() {
      if (cancelled) return;
      timerRef.current = window.setTimeout(() => void read(), POLL_MS);
    }

    async function read(): Promise<void> {
      // The league comes first because the schedule is fetched for its
      // season - taking that from the system clock would break every
      // January, when the season is still the previous year's.
      return getLeague(leagueId)
        .then(async (league) => {
          const [rosters, rows, pool, schedule_] = await Promise.all([
            getLeagueRosters(leagueId),
            getMatchups(leagueId, targetWeek),
            loadDraftPlayerPool(),
            cachedSchedule(league.season),
          ]);
          if (cancelled) return;

          const byId = new Map(pool.map((p) => [p.id, p]));
          const ownerByRoster = new Map(rosters.map((r) => [r.roster_id, r.owner_id]));
          const slots = (league.roster_positions ?? []).filter((p) => p !== "BN");
          const weekGames = schedule_.filter((g) => g.week === targetWeek);

          const teams = rows.map((row): LiveTeam => {
            const starterIds = row.starters ?? [];
            const starterPoints = row.starters_points ?? [];
            const playersPoints = row.players_points ?? {};
            let yetToPlay = 0;

            const starters = slots.map((slot, i): LiveStarter => {
              const id = starterIds[i];
              const points = starterPoints[i] ?? 0;
              // "0" is Sleeper's empty-slot marker, not a player id.
              if (!id || id === "0") {
                return { slot, name: null, position: null, team: null, points, gameState: "pre" };
              }
              const player = byId.get(id);
              const team = player?.team ?? null;
              const gameState = gameStateFor(team, weekGames);
              if (gameState === "pre") yetToPlay++;
              return {
                slot,
                name: player?.name ?? id,
                position: player?.position ?? null,
                team,
                points,
                gameState,
              };
            });

            const startingSet = new Set(starterIds.filter((id) => id && id !== "0"));
            const benchPoints = Object.entries(playersPoints)
              .filter(([id]) => !startingSet.has(id))
              .reduce((sum, [, pts]) => sum + (pts ?? 0), 0);

            return {
              rosterId: row.roster_id,
              ownerUserId: ownerByRoster.get(row.roster_id) ?? null,
              points: row.points ?? 0,
              benchPoints,
              starters,
              yetToPlay,
            };
          });

          const byMatchup = new Map<number, LiveTeam[]>();
          for (const [i, row] of rows.entries()) {
            if (row.matchup_id === null) continue;
            const arr = byMatchup.get(row.matchup_id) ?? [];
            arr.push(teams[i]);
            byMatchup.set(row.matchup_id, arr);
          }

          const matchups: LiveMatchup[] = [...byMatchup.entries()]
            .filter(([, pair]) => pair.length === 2)
            .map(([matchupId, [a, b]]) => ({ matchupId, a, b }))
            .sort((x, y) => x.matchupId - y.matchupId);

          const weekComplete =
            weekGames.length > 0 && weekGames.every((g) => g.status === "complete");

          setState({
            matchups,
            loading: false,
            error: null,
            updatedAt: new Date(),
            refreshing: false,
            weekComplete,
          });
          // Nothing left to poll for once every game is final.
          if (!weekComplete) schedule();
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // Keep the last good scoreboard up - a dropped request is no
          // reason to blank the scores mid-game.
          setState((prev) => ({
            ...prev,
            loading: false,
            refreshing: false,
            error: err instanceof Error ? err.message : "Couldn't load scores",
          }));
          schedule();
        });
    }

    tickRef.current = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setState((prev) => ({ ...prev, refreshing: true }));
      void read();
    };

    void read();
    return () => {
      cancelled = true;
      tickRef.current = null;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [leagueId, week]);

  const refresh = useCallback(() => {
    tickRef.current?.();
  }, []);

  return { ...state, refresh };
}
