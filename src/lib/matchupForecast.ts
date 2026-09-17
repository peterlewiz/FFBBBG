import { normalCdf } from "./seasonForm";

/**
 * How much of the call comes from this week's starting lineups, with the
 * rest from Elo.
 *
 * Weighted towards the lineup because it's the only input that knows who
 * is actually playing this week - byes, injuries, and the roster as it
 * stands right now. Elo knows none of that; what it does know is how a
 * manager has actually performed over years, which projections miss
 * entirely (waiver-wire work, start/sit decisions, trades). Neither is
 * worth trusting alone, so this leans on the lineup without discarding
 * the record.
 */
const LINEUP_WEIGHT = 0.65;

function logit(p: number): number {
  // Clamped so a near-certain input can't produce an infinite log-odds
  // and swamp the blend.
  const clamped = Math.min(0.999, Math.max(0.001, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface MatchupForecast {
  /** Blended probability that team A outscores team B. */
  probA: number;
  /** Projected points for each starting lineup this week. */
  pointsA: number;
  pointsB: number;
  /** The two inputs on their own, so the UI can show where a call came
   * from when they disagree. */
  lineupProbA: number;
  eloProbA: number;
}

/**
 * Combines a projected-points margin with Elo into one win probability.
 *
 * The two are blended as log-odds rather than by averaging the
 * probabilities: averaging drags every call towards 50% (a 90% and a 70%
 * average to 80%, when two independent reads that agree should land
 * higher than either alone), while log-odds adds the evidence up the way
 * odds actually combine.
 */
export function forecastMatchup(
  pointsA: number,
  pointsB: number,
  eloProbA: number,
  weeklySd: number,
): MatchupForecast {
  // Both lineups are treated as independent draws around their
  // projection with the same spread, so the margin's sd is sd*sqrt(2).
  const spread = weeklySd * Math.SQRT2;
  const lineupProbA = spread > 0 ? normalCdf((pointsA - pointsB) / spread) : 0.5;
  const probA = sigmoid(
    LINEUP_WEIGHT * logit(lineupProbA) + (1 - LINEUP_WEIGHT) * logit(eloProbA),
  );
  return { probA, pointsA, pointsB, lineupProbA, eloProbA };
}
