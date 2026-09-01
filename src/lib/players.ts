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

// Bump this whenever DraftPlayer's shape changes - a stale cached blob
// missing newer fields entirely (not even `null`) broke sorting for
// unmatched players (see mergeExpertRankings/expertRank): `undefined`
// isn't `null`, so a strict `!== null` check treated a merely-absent
// field as "has a real expert rank", which the sort could put anywhere.
const CACHE_KEY = "players:fantasy-relevant:v5";
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
  /**
   * This player's rank within their own position when Sleeper's pool is
   * sorted by searchRank alone (1 = the position's Sleeper darling).
   * Distinct from expertRank: this is "what an opponent relying on
   * Sleeper's own default rankings sees," not a quality signal in its own
   * right. Only useful in comparison to expertRank (see marketGap) - the
   * whole point of tracking it is that other drafters in a Sleeper mock
   * or live draft who don't have real expert data will draft off *this*
   * number instead.
   */
  sleeperPositionRank: number;
  age: number | null;
  yearsExp: number | null;
  status: string | null;
  injuryStatus: string | null;
  /**
   * FantasyPros half-PPR expert consensus rank, within this player's own
   * position (matches `posRank`, e.g. expertRank 4 = posRank "RB4").
   * Null if FantasyPros data wasn't available or didn't include this
   * player. Not comparable between different positions (a QB with
   * expertRank 3 isn't "better than" an RB with expertRank 5) - it's a
   * within-position sort key.
   */
  expertRank: number | null;
  /** Human-readable position rank, e.g. "RB4" - same data as expertRank. */
  posRank: string | null;
  expertTier: number | null;
  byeWeek: number | null;
  /** FantasyPros' projected half-PPR points for the full 2026 season. */
  projectedPoints: number | null;
  /** This player's rank within their position by projectedPoints alone -
   * "what the numbers say" for comparison against expertRank ("what the
   * market/experts say"). */
  projectedRank: number | null;
  /**
   * Projected points and expert consensus blended into one figure - the
   * point estimate all value math (VBD) actually runs on. Null when
   * FantasyPros covers neither side for this player.
   */
  blendedPoints: number | null;
  /**
   * expertRank minus projectedRank, when both exist. Positive = the raw
   * point projection ranks this player better than expert consensus does
   * (a sleeper: the numbers like them more than the market does).
   * Negative = consensus ranks them better than the numbers do (a fade -
   * likely priced on name value/last year's results more than the
   * upcoming season's actual expected production). Null if either side
   * is missing, which is common outside a position's top ~50-100 or so.
   */
  valueGap: number | null;
  /**
   * sleeperPositionRank minus expertRank, when expertRank is within this
   * position's relevance cutoff. This is the "edge over the room" signal,
   * separate from valueGap: valueGap compares FantasyPros against itself
   * (projection vs. its own consensus) to judge a player's real quality.
   * marketGap compares Sleeper's own popularity-based ranking against
   * real expert consensus, to find where *other drafters* (who are
   * likely going off Sleeper's own rankings, not paid expert data) are
   * probably wrong. Positive = Sleeper's default ranks them worse than
   * real experts do, so the field will likely pass on them longer than
   * they should - a name to target late for value the room doesn't see
   * coming. Negative = Sleeper's own popularity has them ranked better
   * than real experts do, so the field will likely reach for them early -
   * a name to either avoid overpaying for or to grab a round ahead of
   * where the "real" analysis says you'd need to.
   */
  marketGap: number | null;
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
      sleeperPositionRank: 0, // assigned below, after sorting
      age: p.age ?? null,
      yearsExp: p.years_exp ?? null,
      status: p.status ?? null,
      injuryStatus: p.injury_status ?? null,
      expertRank: null,
      posRank: null,
      expertTier: null,
      byeWeek: null,
      projectedPoints: null,
      projectedRank: null,
      blendedPoints: null,
      valueGap: null,
      marketGap: null,
    });
  }

  const out: DraftPlayer[] = [];
  for (const pos of FANTASY_POSITIONS) {
    byPosition[pos].sort((a, b) => a.searchRank - b.searchRank);
    // Assign before capping so the ordinal reflects this player's real
    // standing in Sleeper's full pool for the position, not just their
    // position among survivors of our own storage-size trim.
    byPosition[pos].forEach((player, i) => (player.sleeperPositionRank = i + 1));
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

// How deep each position stays fantasy-relevant, for the value-gap and
// market-gap calculations only (expertRank/posRank/projectedPoints
// display for every real match regardless). Verified live: without this, the
// "biggest gaps" were almost all fullbacks and 4th-string depth (a
// player ranked RB150 by consensus but with *some* baseline projected
// points reads as a huge "sleeper" gap that's actually just noise from
// two models barely disagreeing about someone nobody would draft).
// These match typical redraft-relevant depth: QB/TE are shallow
// positions with a real cliff, RB/WR stay relevant much deeper.
const VALUE_GAP_RELEVANCE_CUTOFF: Record<string, number> = {
  QB: 24,
  RB: 60,
  WR: 70,
  TE: 24,
};

/**
 * Folds FantasyPros' half-PPR expert consensus + projections into the
 * Sleeper-derived pool, matched by normalized name + position (the two
 * APIs use different player IDs, so name is the only shared key). K/DEF
 * are left on Sleeper's searchRank untouched: FantasyPros quota isn't
 * worth spending on positions with this little real weekly skill
 * differentiation.
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

    const cutoff = VALUE_GAP_RELEVANCE_CUTOFF[player.position];
    const bothRelevant =
      match.rankEcr !== null &&
      match.projectedRank !== null &&
      cutoff !== undefined &&
      match.rankEcr <= cutoff &&
      match.projectedRank <= cutoff;
    const valueGap = bothRelevant ? match.rankEcr! - match.projectedRank! : null;

    // marketGap only requires expertRank itself to be within relevance
    // range - sleeperPositionRank is deliberately *not* cutoff-filtered,
    // since a player real experts rate startable but Sleeper's own
    // ranking buries deep is exactly the edge case this is meant to
    // surface (that gap being large is the point, not noise to exclude).
    const expertRelevant = match.rankEcr !== null && cutoff !== undefined && match.rankEcr <= cutoff;
    const marketGap = expertRelevant ? player.sleeperPositionRank - match.rankEcr! : null;

    return {
      ...player,
      expertRank: match.rankEcr,
      posRank: match.posRank,
      expertTier: match.tier,
      byeWeek: match.byeWeek,
      projectedPoints: match.projectedPoints,
      projectedRank: match.projectedRank,
      blendedPoints: match.blendedPoints,
      valueGap,
      marketGap,
    };
  });
}

export interface PlayerPoolState {
  players: DraftPlayer[];
  loading: boolean;
  error: string | null;
  expertRankingsAvailable: boolean;
  expertRankingsStale: boolean;
  expertRankingsFullDepth: boolean;
}

export function usePlayerPool(): PlayerPoolState {
  const [state, setState] = useState<PlayerPoolState>({
    players: [],
    loading: true,
    error: null,
    expertRankingsAvailable: false,
    expertRankingsStale: false,
    expertRankingsFullDepth: false,
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
          expertRankingsFullDepth: fp.fullDepth,
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
            expertRankingsFullDepth: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
