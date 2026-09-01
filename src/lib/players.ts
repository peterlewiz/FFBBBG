import { useEffect, useState } from "react";
import { getAllPlayers } from "../api/sleeper";
import { cacheGet, cacheSet } from "../api/cache";
import type { SleeperPlayer } from "../api/types";

const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
export type FantasyPosition = (typeof FANTASY_POSITIONS)[number];

// Sleeper's /players/nfl is ~15MB covering every player it's ever tracked
// (mostly long-retired or practice-squad names). Kept per position so a
// deep redraft league still has waiver-wire depth without hauling the
// whole irrelevant tail of the player pool into localStorage.
const CAP_PER_POSITION: Record<FantasyPosition, number> = {
  QB: 60,
  RB: 150,
  WR: 200,
  TE: 100,
  K: 40,
  DEF: 32, // all 32 teams
};

const CACHE_KEY = "players:fantasy-relevant:v1";
// Sleeper asks that this endpoint only be hit about once a day.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface DraftPlayer {
  id: string;
  name: string;
  position: FantasyPosition;
  team: string | null;
  /** Sleeper's own relevance ranking - lower is more relevant. Not a
   * projection, just a consensus-ish "who matters" proxy. */
  searchRank: number;
  age: number | null;
  yearsExp: number | null;
  status: string | null;
  injuryStatus: string | null;
}

function isFantasyPosition(p: string | null): p is FantasyPosition {
  return !!p && (FANTASY_POSITIONS as readonly string[]).includes(p);
}

function trimAndCap(raw: Record<string, SleeperPlayer>): DraftPlayer[] {
  const byPosition: Record<FantasyPosition, DraftPlayer[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DEF: [],
  };

  for (const p of Object.values(raw)) {
    if (!isFantasyPosition(p.position)) continue;
    // DEF entries don't reliably carry `active`; every real skill/K
    // player that's inactive (retired, practice squad forever, etc.) is
    // safe to drop.
    if (p.position !== "DEF" && p.active === false) continue;

    byPosition[p.position].push({
      id: p.player_id,
      name: p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.player_id,
      position: p.position,
      team: p.team,
      searchRank: p.search_rank ?? 9999999,
      age: p.age ?? null,
      yearsExp: p.years_exp ?? null,
      status: p.status ?? null,
      injuryStatus: p.injury_status ?? null,
    });
  }

  const out: DraftPlayer[] = [];
  for (const pos of FANTASY_POSITIONS) {
    byPosition[pos].sort((a, b) => a.searchRank - b.searchRank);
    out.push(...byPosition[pos].slice(0, CAP_PER_POSITION[pos]));
  }
  return out;
}

/**
 * The fantasy-relevant player pool, trimmed and capped so the ~15MB raw
 * payload never touches localStorage - only this much smaller result
 * does, cached for a day per Sleeper's own guidance on this endpoint.
 */
export async function loadDraftPlayerPool(): Promise<DraftPlayer[]> {
  const cached = cacheGet<DraftPlayer[]>(CACHE_KEY);
  if (cached) return cached;
  const raw = await getAllPlayers();
  const trimmed = trimAndCap(raw);
  cacheSet(CACHE_KEY, trimmed, CACHE_TTL_MS);
  return trimmed;
}

export interface PlayerPoolState {
  players: DraftPlayer[];
  loading: boolean;
  error: string | null;
}

export function usePlayerPool(): PlayerPoolState {
  const [state, setState] = useState<PlayerPoolState>({
    players: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadDraftPlayerPool()
      .then((players) => {
        if (!cancelled) setState({ players, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            players: [],
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load player data",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
