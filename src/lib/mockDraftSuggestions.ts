import type { DraftPlayer, FantasyPosition } from "./players";
import type { SleeperDraft, SleeperDraftPick } from "../api/types";
import {
  rosterRequirementsFromDraftSettings,
  computeReplacementPoints,
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
// relevance number (search_rank), not real expert analysis. This mock
// draft's other seats are CPU-filled (cpu_autopick), which lean on
// exactly that number, so search_rank (cross-position - it's Sleeper's
// one shared relevance scale, unlike position-scoped expertRank) is
// the right input for modeling pick timing.
//
// Model: rank every undrafted player by search_rank alone - that
// ordering approximates "the order the room takes players in". A
// candidate's position in that ordering is treated as the mean of a
// normal distribution over "how many more picks until they're taken",
// with a spread that widens further down the board (the consensus top
// picks are near-unanimous; a rank-80 pick has real variance in who
// reaches for it and when). Survival probability is just the right
// tail of that distribution beyond however many picks stand between
// now and your next turn.
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
  // for exactly the consensus top players this matters most for -
  // caught by testing this exact case against live data before shipping.
  if (picksUntilNext <= 0) return 1;
  const sd = Math.max(2, sleeperOrderRank * 0.4);
  // P(actual pick position > picksUntilNext) = 1 - CDF(picksUntilNext)
  return 1 - normalCdf(picksUntilNext, sleeperOrderRank, sd);
}

// ---------------------------------------------------------------------
// Value-based drafting (RosterRequirements, computeReplacementPoints)
// now lives in valueBasedRanking.ts, shared with the standing Player
// Board's own cross-position ranking - see that file for the rationale.
// ---------------------------------------------------------------------

const FLEX_ELIGIBLE: FantasyPosition[] = ["RB", "WR", "TE"];

// ---------------------------------------------------------------------
// Positional need
// ---------------------------------------------------------------------

function countByPosition(players: DraftPlayer[]): Record<FantasyPosition, number> {
  const counts: Record<FantasyPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const p of players) counts[p.position]++;
  return counts;
}

/** >1 = actively needed, 1 = neutral (best-player-available), <1 =
 * already well-stocked at this position. */
function needMultiplier(
  position: FantasyPosition,
  myCounts: Record<FantasyPosition, number>,
  req: RosterRequirements,
  round: number,
  totalRounds: number,
): number {
  // K/DEF: real draft strategy is "stream, don't spend an early pick" -
  // matches this site's own scarcity ranking, which excludes them for
  // the same reason. Only worth suggesting in the final couple rounds.
  if (position === "K" || position === "DEF") {
    if (round < totalRounds - 1) return 0.1;
    return myCounts[position] < req[position] ? 1.3 : 0.6;
  }

  if (position === "QB") {
    return myCounts.QB < req.QB ? 1.25 : 0.7;
  }

  // RB/WR/TE share FLEX - "need" means either an empty dedicated slot or
  // an unclaimed flex spot.
  const dedicated = req[position];
  const surplusAcrossFlexEligible = FLEX_ELIGIBLE.reduce(
    (sum, pos) => sum + Math.max(0, myCounts[pos] - req[pos]),
    0,
  );
  const directNeed = myCounts[position] < dedicated;
  const flexOpen = surplusAcrossFlexEligible < req.flexSlots;
  if (directNeed) return 1.3;
  if (flexOpen) return 1.1;
  return 0.8;
}

// ---------------------------------------------------------------------
// Suggestion engine
// ---------------------------------------------------------------------

export interface PickSuggestion {
  player: DraftPlayer;
  /** Points-over-replacement, this player's position vs. their
   * position's replacement level - cross-position comparable. */
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
}

export function computePickSuggestions(input: SuggestionInput, count = 3): PickSuggestion[] {
  const { players, draftedPlayerIds, myPlayerIds, draftSettings, currentRound, picksUntilNext } = input;
  const req = rosterRequirementsFromDraftSettings(draftSettings);
  const totalRounds = draftSettings?.rounds ?? 14;

  const available = players.filter((p) => !draftedPlayerIds.has(p.id));
  // Sleeper's own cross-position relevance order among what's actually
  // still on the board - the timing model's input.
  const sleeperOrder = [...available].sort((a, b) => a.searchRank - b.searchRank);
  const sleeperOrderRank = new Map<string, number>();
  sleeperOrder.forEach((p, i) => sleeperOrderRank.set(p.id, i + 1));

  const replacementPoints = computeReplacementPoints(available, req);
  const myCounts = countByPosition(players.filter((p) => myPlayerIds.has(p.id)));

  // Only recommend players real expert analysis actually covers -
  // expert data is the ground truth for quality throughout this page,
  // so a pure Sleeper-popularity guess with no expert backing isn't a
  // "suggestion", it's a shrug.
  const candidates = available.filter(
    (p) =>
      p.expertRank !== null &&
      (p.position === "QB" || p.position === "RB" || p.position === "WR" || p.position === "TE" || p.position === "K" || p.position === "DEF"),
  );

  const scored: PickSuggestion[] = candidates.map((player) => {
    const vbd = (player.projectedPoints ?? 0) - replacementPoints[player.position];
    const order = sleeperOrderRank.get(player.id) ?? sleeperOrder.length;
    const survival = survivalProbability(order, picksUntilNext);
    const need = needMultiplier(player.position, myCounts, req, currentRound, totalRounds);
    // Urgency: a player almost certain to be gone by your next pick is
    // worth reaching for now; one who'll obviously survive can be
    // deferred in favor of someone more urgently needed this instant.
    const urgency = 0.7 + 0.6 * (1 - survival);
    const score = vbd * need * urgency;

    const reasons: string[] = [];
    reasons.push(`${player.posRank ?? player.position} by expert consensus`);
    if (player.marketGap !== null && player.marketGap >= 15) {
      reasons.push(`Sleeper's own ranking has them ${player.marketGap} spots lower than experts - the room is sleeping on them`);
    } else if (player.marketGap !== null && player.marketGap <= -15) {
      reasons.push(`Sleeper's own ranking has them ${Math.abs(player.marketGap)} spots higher than experts - bots will reach early`);
    }
    if (picksUntilNext > 0) {
      reasons.push(
        survival < 0.35
          ? `Only ~${Math.round(survival * 100)}% likely to survive to your next pick (#${picksUntilNext} picks away) - grab them now`
          : survival > 0.75
            ? `~${Math.round(survival * 100)}% likely to still be there next turn - safe to wait if you need someone else more`
            : `~${Math.round(survival * 100)}% likely to survive to your next pick`,
      );
    }
    if (need >= 1.25) reasons.push(`Fills an open starting need at ${player.position}`);
    else if (need <= 0.8 && player.position !== "K" && player.position !== "DEF") {
      reasons.push(`Already deep at ${player.position} - would be pure bench/flex depth`);
    }

    return { player, vbd, survivalProbability: survival, score, reasons };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, count);
}

/** Given the current number of picks already made, how many other
 * teams pick before this drafter's next turn (0 if it's currently their
 * turn or they're on the clock next). Mirrors picksUntilNext's static
 * math but against the live pick count instead of a fixed round. */
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
