import { useCallback, useEffect, useRef, useState } from "react";
import { getLeague, getLeagueRosters, getMatchups } from "../api/sleeper";
import { loadDraftPlayerPool } from "./players";
import { buildForecastModel, type ForecastModel, type PlayerForecast } from "./playerForecast";

export interface StarterForecast {
  /** The lineup slot - "QB", "FLEX", ... */
  slot: string;
  /** Null when the manager has left the slot empty. */
  name: string | null;
  position: string | null;
  team: string | null;
  forecast: PlayerForecast | null;
}

export interface TeamLineupForecast {
  points: number;
  starters: StarterForecast[];
  onBye: number;
  out: number;
  emptySlots: number;
}

export interface LineupForecastsState {
  byUserId: Record<string, TeamLineupForecast>;
  model: ForecastModel | null;
  loading: boolean;
  error: string | null;
  /** When the last successful read landed. */
  updatedAt: Date | null;
  /** True while a re-read is in flight. */
  refreshing: boolean;
  /** Re-read now instead of waiting for the next poll. */
  refresh: () => void;
}

/**
 * How often the lineups are re-read.
 *
 * Needed because a lineup change is invisible otherwise: the underlying
 * request isn't cached, but nothing re-ran it either, so a tab left open
 * kept showing the lineup from whenever it was opened. Sixty seconds is
 * two small requests a minute against Sleeper, the same cadence the
 * predictions lock already polls at. The expensive inputs - the player
 * list, past stat lines, projections - are read through their own caches
 * underneath, so a tick that changes nothing costs almost nothing.
 */
const POLL_MS = 60_000;

/**
 * Every team's projected points for a week, slot by slot, from the
 * lineup they currently have set in Sleeper.
 *
 * Deliberately built on Sleeper data end to end - the rosters, the past
 * stat lines behind each player's number, and the league's own scoring
 * rules used to score them. No outside projection service is involved,
 * which means every figure here can be traced back to games that
 * actually happened under rules this league actually uses.
 */
export function useLineupForecasts(leagueId: string, targetWeek: number | null): LineupForecastsState {
  const [state, setState] = useState<Omit<LineupForecastsState, "refresh">>({
    byUserId: {},
    model: null,
    loading: true,
    error: null,
    updatedAt: null,
    refreshing: false,
  });
  // Recursive setTimeout rather than setInterval, so a slow response
  // can't stack overlapping reads.
  const timerRef = useRef<number | null>(null);
  // Lets refresh() reach the running effect's tick without re-running
  // the effect, which would tear the polling down and start it again.
  const tickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (targetWeek === null) return;
    // Captured so the nested reads keep the narrowed type - the early
    // return above doesn't narrow inside a closure.
    const week = targetWeek;

    function schedule() {
      if (cancelled) return;
      timerRef.current = window.setTimeout(() => void read(), POLL_MS);
    }

    async function read(): Promise<void> {
    return Promise.all([
      getLeague(leagueId),
      getLeagueRosters(leagueId),
      loadDraftPlayerPool(),
      // The week's lineups come from the matchup rows, not the roster
      // rows - see SleeperMatchup.starters. Missing (a week Sleeper
      // hasn't created yet) falls back to the roster's lineup.
      getMatchups(leagueId, week).catch(() => []),
    ])
      .then(async ([league, rosters, pool, matchups]) => {
        if (cancelled) return;
        const model = await buildForecastModel({
          season: league.season,
          targetWeek: week,
          scoring: league.scoring_settings,
          players: pool,
        });
        if (cancelled) return;

        const byId = new Map(pool.map((p) => [p.id, p]));
        const slots = (league.roster_positions ?? []).filter((p) => p !== "BN");
        const byUserId: Record<string, TeamLineupForecast> = {};

        const weekStarters = new Map(
          matchups
            .filter((m) => m.starters && m.starters.length > 0)
            .map((m) => [m.roster_id, m.starters as string[]]),
        );

        for (const roster of rosters) {
          if (!roster.owner_id) continue;
          const starterIds = weekStarters.get(roster.roster_id) ?? roster.starters ?? [];
          let points = 0;
          let onBye = 0;
          let out = 0;
          let emptySlots = 0;

          const starters: StarterForecast[] = slots.map((slot, i) => {
            const id = starterIds[i];
            // "0" is Sleeper's empty-slot marker, not a player id.
            if (!id || id === "0") {
              emptySlots++;
              return { slot, name: null, position: null, team: null, forecast: null };
            }
            const player = byId.get(id);
            if (!player) {
              // A real player Sleeper is starting but the trimmed pool
              // doesn't cover - shown by id rather than dropped, and
              // contributing nothing rather than a guess.
              return { slot, name: id, position: null, team: null, forecast: null };
            }
            const forecast = model.predict(player);
            points += forecast.points;
            if (forecast.onBye) onBye++;
            if (forecast.out) out++;
            return {
              slot,
              name: player.name,
              position: player.position,
              team: player.team,
              forecast,
            };
          });

          byUserId[roster.owner_id] = { points, starters, onBye, out, emptySlots };
        }

        setState({
          byUserId,
          model,
          loading: false,
          error: null,
          updatedAt: new Date(),
          refreshing: false,
        });
        schedule();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Keep whatever was last read on screen - a dropped request is
        // no reason to blank out a working forecast - and try again.
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: err instanceof Error ? err.message : "Failed to build the forecast",
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
  }, [leagueId, targetWeek]);

  const refresh = useCallback(() => {
    tickRef.current?.();
  }, []);

  return { ...state, refresh };
}
