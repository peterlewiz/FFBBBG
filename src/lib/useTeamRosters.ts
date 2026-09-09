import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters } from "../api/sleeper";
import { loadDraftPlayerPool, type DraftPlayer } from "./players";

export interface RosterSlot {
  /** The lineup position this slot represents - "QB", "FLEX", "BN", ... */
  slot: string;
  /** Null when the slot is empty, or when Sleeper hands back a player id
   * that isn't in the cached pool (very deep waiver adds). */
  player: DraftPlayer | null;
  /** Kept so an unmatched id can still be shown rather than vanishing. */
  playerId: string | null;
}

export interface TeamRoster {
  rosterId: number;
  ownerUserId: string | null;
  starters: RosterSlot[];
  bench: RosterSlot[];
}

export interface TeamRostersState {
  rosters: TeamRoster[];
  loading: boolean;
  error: string | null;
}

/**
 * Every team's current lineup, split into starters and bench.
 *
 * Sleeper's roster payload is only player ids, so this joins them against
 * the cached player pool for names. `starters` comes back positionally
 * aligned with the league's roster_positions minus its BN slots, which is
 * what lets each starting slot be labelled QB/RB/FLEX/etc rather than
 * just listed.
 */
export function useTeamRosters(leagueId: string): TeamRostersState {
  const [state, setState] = useState<TeamRostersState>({
    rosters: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([getLeague(leagueId), getLeagueRosters(leagueId), loadDraftPlayerPool()])
      .then(([league, rosters, pool]) => {
        if (cancelled) return;
        const byId = new Map(pool.map((p) => [p.id, p]));
        // "0" is Sleeper's empty-slot marker, not a player id.
        const toSlot = (slot: string, id: string | undefined): RosterSlot =>
          !id || id === "0"
            ? { slot, player: null, playerId: null }
            : { slot, player: byId.get(id) ?? null, playerId: id };

        const startingSlots = (league.roster_positions ?? []).filter((p) => p !== "BN");

        setState({
          loading: false,
          error: null,
          rosters: rosters.map((r) => {
            const starterIds = r.starters ?? [];
            const starters = startingSlots.map((slot, i) => toSlot(slot, starterIds[i]));
            const startingSet = new Set(starterIds.filter((id) => id && id !== "0"));
            const bench = (r.players ?? [])
              .filter((id) => !startingSet.has(id))
              .map((id) => toSlot("BN", id))
              // Group the bench by position so it reads like a roster
              // rather than the arbitrary order Sleeper returns.
              .sort((a, b) => {
                const order = ["QB", "RB", "WR", "TE", "K", "DEF"];
                const ai = a.player ? order.indexOf(a.player.position) : 99;
                const bi = b.player ? order.indexOf(b.player.position) : 99;
                return ai - bi || (a.player?.searchRank ?? 9e9) - (b.player?.searchRank ?? 9e9);
              });
            return { rosterId: r.roster_id, ownerUserId: r.owner_id, starters, bench };
          }),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          rosters: [],
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load rosters",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  return state;
}
