import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters } from "../api/sleeper";
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
}

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
  const [state, setState] = useState<LineupForecastsState>({
    byUserId: {},
    model: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (targetWeek === null) return;

    Promise.all([getLeague(leagueId), getLeagueRosters(leagueId), loadDraftPlayerPool()])
      .then(async ([league, rosters, pool]) => {
        if (cancelled) return;
        const model = await buildForecastModel({
          season: league.season,
          targetWeek,
          scoring: league.scoring_settings,
          players: pool,
        });
        if (cancelled) return;

        const byId = new Map(pool.map((p) => [p.id, p]));
        const slots = (league.roster_positions ?? []).filter((p) => p !== "BN");
        const byUserId: Record<string, TeamLineupForecast> = {};

        for (const roster of rosters) {
          if (!roster.owner_id) continue;
          const starterIds = roster.starters ?? [];
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

        setState({ byUserId, model, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          byUserId: {},
          model: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to build the forecast",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId, targetWeek]);

  return state;
}
