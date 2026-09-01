import { useEffect, useState } from "react";
import { getAllPlayers } from "../api/sleeper";
import { cacheGet, cacheSet } from "../api/cache";
import type { SleeperPlayer } from "../api/types";
import {
  fetchFantasyProsRankings,
  normalizePlayerName,
  type FantasyProsData,
  type FantasyProsPlayer,
} from "./fantasyProsRankings";

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
   * projection, just a consensus-ish "who matters" proxy. Used as the
   * sort key only when there's no FantasyPros expert rank for this
   * player (K/DEF always, or anyone the name-match missed). */
  searchRank: number;
  age: number | null;
  yearsExp: number | null;
  status: string | null;
  injuryStatus: string | null;
  /**
   * FantasyPros half-PPR expert consensus rank, within this player's own
   * position (matches `posRank`, e.g. expertRank 4 = posRank "RB4"). The
   * free API tier hard-caps every position query at its top 10, so this
   * is only ever set for someone's real top 10 at their position - null
   * otherwise, including for anyone FantasyPros data wasn't available
   * for or the name-match missed. There's no cross-position blended
   * source at this tier, so this number is *not* comparable between
   * different positions (a QB with expertRank 3 isn't "better than" an
   * RB with expertRank 5) - it's a within-position sort key only.
   */
  expertRank: number | null;
  /** Human-readable position rank, e.g. "RB4" - same data as expertRank. */
  posRank: string | null;
  expertTier: number | null;
  byeWeek: number | null;
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
      expertRank: null,
      posRank: null,
      expertTier: null,
      byeWeek: null,
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

/**
 * Folds FantasyPros' half-PPR expert consensus into the Sleeper-derived
 * pool, matched by normalized name + position (the two APIs use
 * different player IDs, so name is the only shared key). Each position
 * (QB/RB/WR/TE) is queried on its own, so this only ever covers each
 * position's real top 10 - the free API tier's hard cap, confirmed live
 * ("public_api_limited": true). K/DEF are left on Sleeper's searchRank
 * untouched: FantasyPros quota isn't worth spending on positions with
 * this little real weekly skill differentiation.
 */
export function mergeExpertRankings(players: DraftPlayer[], fp: FantasyProsData): DraftPlayer[] {
  if (fp.players.length === 0) return players;

  const byKey = new Map<string, FantasyProsPlayer>();
  for (const p of fp.players) {
    byKey.set(`${normalizePlayerName(p.name)}|${p.position}`, p);
  }

  return players.map((player) => {
    const match = byKey.get(`${normalizePlayerName(player.name)}|${player.position}`);
    if (!match) return player;
    return {
      ...player,
      expertRank: match.rankEcr,
      posRank: match.posRank,
      expertTier: match.tier,
      byeWeek: match.byeWeek,
    };
  });
}

export interface PlayerPoolState {
  players: DraftPlayer[];
  loading: boolean;
  error: string | null;
  expertRankingsAvailable: boolean;
  expertRankingsStale: boolean;
}

export function usePlayerPool(): PlayerPoolState {
  const [state, setState] = useState<PlayerPoolState>({
    players: [],
    loading: true,
    error: null,
    expertRankingsAvailable: false,
    expertRankingsStale: false,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadDraftPlayerPool(), fetchFantasyProsRankings()])
      .then(([basePlayers, fp]) => {
        if (cancelled) return;
        setState({
          players: mergeExpertRankings(basePlayers, fp),
          loading: false,
          error: null,
          expertRankingsAvailable: fp.players.length > 0,
          expertRankingsStale: fp.stale,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            players: [],
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load player data",
            expertRankingsAvailable: false,
            expertRankingsStale: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
