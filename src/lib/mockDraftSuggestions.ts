import type { DraftPlayer, FantasyPosition } from "./players";
import type { SleeperDraft, SleeperDraftPick } from "../api/types";
import {
  rosterRequirementsFromDraftSettings,
  computeReplacementPoints,
  valuePoints,
  type RosterRequirements,
} from "./valueBasedRanking";

export type { RosterRequirements };
export { rosterRequirementsFromDraftSettings };

// ---------------------------------------------------------------------
// Survival probability: will a player still be on the board by your
// next pick?
//
// Ground truth for "is this player good" is FantasyPros' expert
// consensus throughout this app. But that's the wrong signal for
// predicting *when a bot or Sleeper-app-only opponent will actually
// draft someone* - those picks are driven by Sleeper's own built-in
// relevance number (search_rank), not real expert analysis. A mock
// draft's other seats are CPU-filled (cpu_autopick), which lean on
// exactly that number, so search_rank (cross-position - it's Sleeper's
// one shared relevance scale, unlike position-scoped expertRank) is
// the right input for modeling pick timing.
// ---------------------------------------------------------------------

/** Standard normal CDF via the Abramowitz-Stegun erf approximation
 * (accurate to ~1e-7, plenty for a heuristic draft-planning number). */
function normalCdf(x: number, mean: number, sd: number): number {
  if (sd <= 0) return x >= mean ? 1 : 0;
  const z = (x - mean) / (sd * Math.SQRT2);
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  const erf = z >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

/**
 * Probability a player is still undrafted after `picksUntilNext` more
 * picks by other teams, given their rank among currently-undrafted
 * players by Sleeper's own search_rank.
 */
export function survivalProbability(sleeperOrderRank: number, picksUntilNext: number): number {
  // Zero other picks between now and "your next turn" means it IS your
  // current turn - anyone still in the available pool is, by
  // definition, on the board right now. The continuous normal model
  // otherwise puts real probability mass below 0 (a "rank" can't
  // actually be negative), which wrongly reads as "maybe already gone"
  // for exactly the consensus top players this matters most for.
  if (picksUntilNext <= 0) return 1;
  const sd = Math.max(2, sleeperOrderRank * 0.4);
  return 1 - normalCdf(picksUntilNext, sleeperOrderRank, sd);
}

const FLEX_ELIGIBLE: FantasyPosition[] = ["RB", "WR", "TE"];

// Hard ceiling on how many of a position are worth rostering at all.
// Without these the engine happily drafted six quarterbacks: past your
// starters there was only ever one flat "already deep" discount, so a
// position whose value number stayed high just kept winning every
// remaining pick. Roster-construction facts, not league settings: a
// 1-QB league never needs a third QB, nobody starts a third TE, and
// K/DEF are strictly one-and-done streaming slots.
const POSITION_LIMIT: Record<FantasyPosition, number> = {
  QB: 2,
  RB: 6,
  WR: 6,
  TE: 2,
  K: 1,
  DEF: 1,
};

// Players FantasyPros doesn't project at all (deep bench, camp bodies,
// and every K/DEF since we don't spend quota on those positions). They
// must rank below anyone with a real projection - including a real but
// *below-replacement* one. Treating a missing projection as 0 instead
// ranked unknowns above known-mediocre players, which is how a draft
// ended up taking Jimmy Garoppolo over quarterbacks with real numbers.
const NO_PROJECTION_VALUE = -200;

function countByPosition(players: DraftPlayer[]): Record<FantasyPosition, number> {
  const counts: Record<FantasyPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const p of players) counts[p.position]++;
  return counts;
}

/** How many FLEX-eligible players you have beyond their own dedicated
 * starting slots - i.e. how much of the FLEX requirement is covered. */
function flexSurplus(counts: Record<FantasyPosition, number>, req: RosterRequirements): number {
  return FLEX_ELIGIBLE.reduce((sum, pos) => sum + Math.max(0, counts[pos] - req[pos]), 0);
}

/** Starting slots (including FLEX, K and DEF) still unfilled. */
function emptyStarterSlots(counts: Record<FantasyPosition, number>, req: RosterRequirements): number {
  let n = 0;
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"] as FantasyPosition[]) {
    n += Math.max(0, req[pos as keyof RosterRequirements] as number - counts[pos]);
  }
  n += Math.max(0, req.flexSlots - flexSurplus(counts, req));
  return n;
}

/** Whether drafting this position would actually close one of those
 * unfilled starting slots. */
function fillsRequiredSlot(
  position: FantasyPosition,
  counts: Record<FantasyPosition, number>,
  req: RosterRequirements,
): boolean {
  if (counts[position] < (req[position as keyof RosterRequirements] as number)) return true;
  if (FLEX_ELIGIBLE.includes(position) && flexSurplus(counts, req) < req.flexSlots) return true;
  return false;
}

/** A FLEX is realistically an RB or a WR in this league (no TE premium),
 * so only those two get credit for covering the FLEX slot. Letting a TE
 * claim it is what put a second tight end ahead of a starting receiver. */
const FLEX_FILLERS: FantasyPosition[] = ["RB", "WR"];

/** Any starting QB, RB or WR slot still empty. */
function coreStartersOpen(counts: Record<FantasyPosition, number>, req: RosterRequirements): boolean {
  return counts.QB < req.QB || counts.RB < req.RB || counts.WR < req.WR;
}

/** A second TE is never the right pick while a starting QB/RB/WR slot is
 * still open - taking TE2 in round 4-5 over a real starting receiver is
 * just a bad draft, regardless of what the value numbers say. */
function isBlockedSecondTE(
  position: FantasyPosition,
  counts: Record<FantasyPosition, number>,
  req: RosterRequirements,
): boolean {
  return position === "TE" && counts.TE >= req.TE && coreStartersOpen(counts, req);
}

/**
 * Positional need as an ADDITIVE adjustment in fantasy points, not a
 * multiplier. This matters: value-over-replacement goes negative for
 * anyone below their position's replacement level, and multiplying a
 * negative value by a *larger* "you need this position" factor made
 * needed players score worse, exactly inverting the intent. Adding
 * points works correctly in both directions.
 */
function needBonus(
  position: FantasyPosition,
  counts: Record<FantasyPosition, number>,
  req: RosterRequirements,
  round: number,
  totalRounds: number,
  slotsLeft: number,
  picksRemaining: number,
): number {
  // K/DEF: no real weekly skill gap and no expert data - never worth a
  // pick until the last couple of rounds, then perfectly normal.
  if (position === "K" || position === "DEF") {
    return round >= totalRounds - 2 ? 0 : -400;
  }
  const shortfall = (req[position as keyof RosterRequirements] as number) - counts[position];
  if (shortfall > 0) {
    // Ramps up as picks run out, so an unfilled starting slot gets
    // progressively more urgent instead of being left to the last round.
    const pressure = picksRemaining > 0 ? slotsLeft / picksRemaining : 1;
    // Needing TWO starters at a position is more urgent than needing
    // one: you have to spend two picks there, and the second comes out
    // of a pool that's still draining while you wait. Without this, a
    // position you need twice (WR) scored identically to one you need
    // once (QB) and lost on raw value - which is how you end up with
    // one good QB and two leftover receivers.
    return (30 + 50 * Math.min(1, pressure)) * (1 + 0.35 * (shortfall - 1));
  }
  if (FLEX_FILLERS.includes(position) && flexSurplus(counts, req) < req.flexSlots) return 12;
  const extra =
    counts[position] - (req[position as keyof RosterRequirements] as number) -
    (FLEX_FILLERS.includes(position) ? req.flexSlots : 0);
  return extra <= 0 ? -10 : extra === 1 ? -25 : -40;
}

/**
 * How much of a player's value you could actually put in your starting
 * lineup. This lineup is QB1/RB2/WR2/TE1/FLEX/K/DEF and the FLEX is
 * realistically RB or WR, so a SECOND quarterback or tight end can
 * never be started at all - their surplus value is bye-week and injury
 * cover, nothing more. Treating all bench depth as equally valuable is
 * how a backup QB or TE2 outranked a receiver who'd start every week.
 * A third or fourth RB/WR is different: it rotates through the FLEX and
 * you start two of them, so injuries and byes give it real usable value.
 *
 * Applied only to POSITIVE value. Scaling a negative down would make a
 * bad unstartable player look *better*, the same inversion that made a
 * multiplicative need factor wrong.
 */
function startableShare(
  position: FantasyPosition,
  counts: Record<FantasyPosition, number>,
  req: RosterRequirements,
): number {
  if (counts[position] < (req[position as keyof RosterRequirements] as number)) return 1;
  if (FLEX_FILLERS.includes(position) && flexSurplus(counts, req) < req.flexSlots) return 1;
  if (position === "QB" || position === "TE") return 0.1;
  if (position === "K" || position === "DEF") return 0.05;
  return 0.35;
}

export interface PickSuggestion {
  player: DraftPlayer;
  /** Points-over-replacement against a stable, full-pool baseline -
   * cross-position comparable. */
  vbd: number;
  survivalProbability: number;
  score: number;
  reasons: string[];
}

export interface SuggestionInput {
  players: DraftPlayer[];
  draftedPlayerIds: Set<string>;
  myPlayerIds: Set<string>;
  draftSettings: SleeperDraft["settings"];
  currentRound: number;
  /** Live count of picks between now and your next turn (0 if you're on
   * the clock right now). */
  picksUntilNext: number;
  /** How many picks you have left in the whole draft, including this
   * one - drives roster-completion urgency. */
  picksRemaining: number;
}

export function computePickSuggestions(input: SuggestionInput, count = 3): PickSuggestion[] {
  const { players, draftedPlayerIds, myPlayerIds, draftSettings, currentRound, picksUntilNext, picksRemaining } =
    input;
  const req = rosterRequirementsFromDraftSettings(draftSettings);
  const totalRounds = draftSettings?.rounds ?? 14;

  const available = players.filter((p) => !draftedPlayerIds.has(p.id));

  // Sleeper's own cross-position relevance order among what's actually
  // still on the board - the pick-timing model's input.
  const sleeperOrder = [...available].sort((a, b) => a.searchRank - b.searchRank);
  const sleeperOrderRank = new Map<string, number>();
  sleeperOrder.forEach((p, i) => sleeperOrderRank.set(p.id, i + 1));

  // Replacement level comes from the FULL player pool, computed once -
  // never the shrinking available pool. Deriving it from what's left
  // was a real bug: FantasyPros only projects ~30 real QBs, so once
  // fewer than 12 projected QBs remained undrafted the baseline
  // collapsed onto the *worst* remaining one (~11 pts instead of
  // ~301), inflating every leftover QB's value by ~290 points and
  // making the engine spend its late rounds hoarding backup QBs.
  const replacementPoints = computeReplacementPoints(players, req);
  const myCounts = countByPosition(players.filter((p) => myPlayerIds.has(p.id)));
  const slotsLeft = emptyStarterSlots(myCounts, req);

  let candidates = available.filter((p) => {
    // Expert data is the quality gate - but K/DEF are exempt, since we
    // deliberately never spend FantasyPros quota on them. Requiring an
    // expert rank made them permanently unsuggestable, so a full mock
    // draft finished with no kicker and no defense at all.
    if (p.position !== "K" && p.position !== "DEF" && p.expertRank === null) return false;
    if (isBlockedSecondTE(p.position, myCounts, req)) return false;
    return myCounts[p.position] < POSITION_LIMIT[p.position];
  });

  // When picks left can only just cover the starting slots left, stop
  // suggesting luxury depth and only offer players who actually
  // complete the lineup.
  if (picksRemaining <= slotsLeft) {
    candidates = candidates.filter((p) => fillsRequiredSlot(p.position, myCounts, req));
  }

  // Two passes: value + survival first, so the second pass can measure
  // the real cost of waiting at each position.
  const enriched = candidates.map((player) => {
    const pts = valuePoints(player);
    const vbd = pts !== null ? pts - replacementPoints[player.position] : NO_PROJECTION_VALUE;
    const order = sleeperOrderRank.get(player.id) ?? sleeperOrder.length;
    return { player, vbd, survival: survivalProbability(order, picksUntilNext) };
  });

  // Best value still on the board at each position among players likely
  // (>=50%) to survive to your next turn. What a player is worth *over
  // that* is what you actually give up by passing on them now. This
  // replaced a flat urgency multiplier, and it's what keeps a position
  // from being punted until only scrubs are left: as the good receivers
  // disappear, the gap to the next survivor grows and WR starts winning
  // picks on its own, without needing a hardcoded positional preference.
  const bestSurvivorVbd = new Map<FantasyPosition, number>();
  for (const e of enriched) {
    if (e.survival < 0.5) continue;
    const cur = bestSurvivorVbd.get(e.player.position);
    if (cur === undefined || e.vbd > cur) bestSurvivorVbd.set(e.player.position, e.vbd);
  }

  const scored: PickSuggestion[] = enriched.map(({ player, vbd, survival }) => {
    const fallback = bestSurvivorVbd.get(player.position) ?? vbd;
    const waitCost = Math.min(40, Math.max(0, vbd - fallback));
    const bonus = needBonus(player.position, myCounts, req, currentRound, totalRounds, slotsLeft, picksRemaining);
    // Discount value you couldn't actually deploy in a starting lineup.
    const share = startableShare(player.position, myCounts, req);
    const usableValue = vbd > 0 ? vbd * share : vbd;
    const score = usableValue + bonus + waitCost * share;

    const reasons: string[] = [];
    reasons.push(`${player.posRank ?? player.position} by expert consensus`);
    if (valuePoints(player) !== null) {
      reasons.push(`${vbd >= 0 ? "+" : ""}${vbd.toFixed(0)} pts vs a replacement ${player.position}`);
    }
    if (waitCost >= 10) {
      reasons.push(
        `Passing costs you ~${waitCost.toFixed(0)} pts - the next ${player.position} likely to last is a real step down`,
      );
    }
    if (player.marketGap !== null && player.marketGap >= 15) {
      reasons.push(`Sleeper's own ranking has them ${player.marketGap} spots lower than experts - the room is sleeping on them`);
    } else if (player.marketGap !== null && player.marketGap <= -15) {
      reasons.push(`Sleeper's own ranking has them ${Math.abs(player.marketGap)} spots higher than experts - bots will reach early`);
    }
    if (picksUntilNext > 0) {
      reasons.push(
        survival < 0.35
          ? `Only ~${Math.round(survival * 100)}% likely to survive your next ${picksUntilNext} picks - grab them now`
          : survival > 0.75
            ? `~${Math.round(survival * 100)}% likely to still be there next turn - safe to wait`
            : `~${Math.round(survival * 100)}% likely to survive to your next pick`,
      );
    }
    if (myCounts[player.position] < (req[player.position as keyof RosterRequirements] as number)) {
      reasons.push(`Fills an open starting ${player.position} slot`);
    } else if (share <= 0.1) {
      reasons.push(`You can't start a second ${player.position} - bench insurance only`);
    } else if (bonus <= -25) {
      reasons.push(`Already deep at ${player.position} - flex/bench depth`);
    }

    return { player, vbd, survivalProbability: survival, score, reasons };
  });

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.player.expertRank ?? 9999) - (b.player.expertRank ?? 9999) ||
        a.player.searchRank - b.player.searchRank,
    )
    .slice(0, count);
}

/** Given the current number of picks already made, how many other
 * teams pick before this drafter's next turn (0 if it's currently their
 * turn or they're on the clock next). */
export function livePicksUntilNext(myOverallPicks: number[], picksMadeSoFar: number): number {
  const nextOverall = picksMadeSoFar + 1;
  const nextOfMine = myOverallPicks.find((overall) => overall >= nextOverall);
  if (nextOfMine === undefined) return 0;
  return Math.max(0, nextOfMine - nextOverall);
}

/** Which snake-draft slot (1-based) is on the clock for a given overall
 * pick number. */
export function slotForOverallPick(overall: number, teams: number): number {
  const round = Math.ceil(overall / teams);
  const positionInRound = overall - (round - 1) * teams;
  return round % 2 === 0 ? teams - positionInRound + 1 : positionInRound;
}

export function isMyTurn(picks: SleeperDraftPick[], myOverallPicks: number[]): boolean {
  const nextOverall = picks.length + 1;
  return myOverallPicks.includes(nextOverall);
}
