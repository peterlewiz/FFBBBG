import type { DraftPlayer, FantasyPosition } from "./players";
import type { SleeperDraft, SleeperLeague } from "../api/types";

// ---------------------------------------------------------------------
// Value-Based Drafting: the standard real methodology for comparing
// players across different positions on one board. A raw point
// projection or a position-relative expert rank (FantasyPros' rank_ecr
// is only ever "1st best QB", "1st best RB", etc. - never comparable
// between positions) can't answer "who's the better pick right now,
// a QB or an RB". VBD can: it's projected points minus the points a
// freely-available replacement at the same position would score, so
// the number itself means the same thing regardless of position.
// ---------------------------------------------------------------------

export interface RosterRequirements {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DEF: number;
  flexSlots: number; // RB/WR/TE-eligible FLEX only
  teams: number;
}

export function rosterRequirementsFromDraftSettings(settings: SleeperDraft["settings"]): RosterRequirements {
  return {
    QB: settings?.slots_qb ?? 1,
    RB: settings?.slots_rb ?? 2,
    WR: settings?.slots_wr ?? 2,
    TE: settings?.slots_te ?? 1,
    K: settings?.slots_k ?? 1,
    DEF: settings?.slots_def ?? 1,
    flexSlots: settings?.slots_flex ?? 1,
    teams: settings?.teams ?? 12,
  };
}

/** Same requirements, derived from the real league's own settings
 * (roster_positions + num_teams) rather than a specific draft's
 * settings object - used for the standing Player Board, which isn't
 * scoped to any one draft. */
export function rosterRequirementsFromLeague(league: SleeperLeague): RosterRequirements {
  const positions = league.roster_positions ?? [];
  const count = (pos: string) => positions.filter((p) => p === pos).length;
  return {
    QB: count("QB"),
    RB: count("RB"),
    WR: count("WR"),
    TE: count("TE"),
    K: count("K"),
    DEF: count("DEF"),
    flexSlots: positions.filter((p) => p === "FLEX" || p === "SUPER_FLEX").length,
    teams: league.settings?.num_teams ?? 12,
  };
}

// How FLEX slots actually get used leaguewide in half-PPR. Splitting
// them evenly across RB/WR/TE was wrong in a way that badly skewed the
// board: it set TE's baseline at TE16 (a cheap bar, since TE production
// craters early) which inflated every mid-tier TE's value, while
// holding WR to WR28 (an expensive bar) which deflated every WR. The
// engine then wanted a second TE in round 4 ahead of a starting
// receiver. This league has no TE premium, so in practice a FLEX is an
// RB or a WR and almost never a tight end.
const FLEX_USAGE: Record<"RB" | "WR" | "TE", number> = { RB: 0.4, WR: 0.55, TE: 0.05 };

/** Replacement rank per position - the last player leaguewide who's a
 * real starter, including FLEX demand weighted by how that slot is
 * actually filled. */
function replacementRanks(req: RosterRequirements): Record<FantasyPosition, number> {
  const flexTotal = req.teams * req.flexSlots;
  return {
    QB: Math.round(req.teams * req.QB),
    RB: Math.round(req.teams * req.RB + flexTotal * FLEX_USAGE.RB),
    WR: Math.round(req.teams * req.WR + flexTotal * FLEX_USAGE.WR),
    TE: Math.round(req.teams * req.TE + flexTotal * FLEX_USAGE.TE),
    K: Math.round(req.teams * req.K),
    DEF: Math.round(req.teams * req.DEF),
  };
}

/**
 * The point estimate every value calculation runs on: projections and
 * expert consensus blended (see fantasyProsRankings.ts), falling back
 * to the raw projection when only that exists. Kept in one place so
 * replacement level and player value can never be measured on
 * different scales.
 */
export function valuePoints(p: Pick<DraftPlayer, "blendedPoints" | "projectedPoints">): number | null {
  return p.blendedPoints ?? p.projectedPoints;
}

export function computeReplacementPoints(
  players: DraftPlayer[],
  req: RosterRequirements,
): Record<FantasyPosition, number> {
  const ranks = replacementRanks(req);
  const byPosition: Record<FantasyPosition, DraftPlayer[]> = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
  for (const p of players) {
    if (valuePoints(p) !== null) byPosition[p.position].push(p);
  }
  const out = {} as Record<FantasyPosition, number>;
  for (const pos of Object.keys(ranks) as FantasyPosition[]) {
    const sorted = [...byPosition[pos]].sort((a, b) => (valuePoints(b) ?? 0) - (valuePoints(a) ?? 0));
    const idx = Math.min(Math.max(ranks[pos] - 1, 0), sorted.length - 1);
    out[pos] = sorted[idx] ? (valuePoints(sorted[idx]) ?? 0) : 0;
  }
  return out;
}

export interface VbdPlayer extends DraftPlayer {
  /** Projected points minus this position's replacement level - the
   * cross-position-comparable "how much better than a free agent" number.
   * Null if there's no projection to base it on (falls back to
   * expertRank/searchRank ordering elsewhere). */
  vbd: number | null;
}

/** Decorates every player with a `vbd` figure and sorts by it
 * descending (nulls last). Doesn't mutate DraftPlayer itself - VBD is
 * inherently roster/league-scoped, not an intrinsic player fact. */
export function rankByVbd(players: DraftPlayer[], req: RosterRequirements): VbdPlayer[] {
  const replacementPoints = computeReplacementPoints(players, req);
  const withVbd: VbdPlayer[] = players.map((p) => ({
    ...p,
    vbd: valuePoints(p) !== null ? (valuePoints(p) as number) - replacementPoints[p.position] : null,
  }));
  return withVbd.sort((a, b) => {
    if (a.vbd === null && b.vbd === null) return a.searchRank - b.searchRank;
    if (a.vbd === null) return 1;
    if (b.vbd === null) return -1;
    return b.vbd - a.vbd;
  });
}
