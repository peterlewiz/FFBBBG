import type { SeasonData } from "./history";

/**
 * Typical week-to-week scoring spread for a single fantasy team, used
 * until there's enough of this season to measure it directly.
 *
 * It matters that this is the *within-team* spread and not the spread
 * between teams in one week. Early on those look similar - week 1 of
 * this season had a between-team sd of about 17 - but the between-team
 * figure mixes real strength differences with one week of luck, and
 * using it makes the model far too confident (a 20-point edge would
 * read as 80%). 25 is a realistic half-PPR weekly sd and keeps early
 * calls appropriately humble.
 */
const DEFAULT_WEEKLY_SD = 25;

export interface TeamForm {
  userId: string;
  games: number;
  meanPoints: number;
}

export interface SeasonForm {
  byUserId: Record<string, TeamForm>;
  /** Completed weeks this form is built from. */
  weeksCounted: number[];
  /** Spread used for the win-probability model. */
  weeklySd: number;
  /** True once weeklySd is measured from this season rather than assumed. */
  sdMeasured: boolean;
}

/**
 * Each team's scoring so far *this season only* - deliberately not
 * carried over from previous seasons, and with nothing borrowed from
 * Elo. Only weeks before the current NFL week count, so a half-played
 * week can't drag a team's average down.
 */
export function computeSeasonForm(season: SeasonData | null, currentWeek: number | null): SeasonForm {
  const empty: SeasonForm = {
    byUserId: {},
    weeksCounted: [],
    weeklySd: DEFAULT_WEEKLY_SD,
    sdMeasured: false,
  };
  if (!season || currentWeek === null) return empty;

  const rosterToUser = new Map(
    season.rosters.filter((r) => r.ownerUserId).map((r) => [r.rosterId, r.ownerUserId as string]),
  );

  const scores = new Map<string, number[]>();
  const weeks = new Set<number>();
  for (const row of season.weeks) {
    if (row.week >= currentWeek) continue; // not finished
    if (row.points <= 0) continue; // unplayed or bye
    const userId = rosterToUser.get(row.rosterId);
    if (!userId) continue;
    (scores.get(userId) ?? scores.set(userId, []).get(userId)!).push(row.points);
    weeks.add(row.week);
  }
  if (scores.size === 0) return empty;

  const byUserId: Record<string, TeamForm> = {};
  for (const [userId, pts] of scores) {
    byUserId[userId] = {
      userId,
      games: pts.length,
      meanPoints: pts.reduce((a, b) => a + b, 0) / pts.length,
    };
  }

  // Pooled within-team spread, once any team has more than one game.
  // Between-team spread is deliberately not used - see DEFAULT_WEEKLY_SD.
  let sumSq = 0;
  let dof = 0;
  for (const [userId, pts] of scores) {
    if (pts.length < 2) continue;
    const mean = byUserId[userId].meanPoints;
    for (const p of pts) sumSq += (p - mean) ** 2;
    dof += pts.length - 1;
  }
  const measured = dof > 0 ? Math.sqrt(sumSq / dof) : null;

  return {
    byUserId,
    weeksCounted: [...weeks].sort((a, b) => a - b),
    // Keep a floor even once measured: a couple of games can produce an
    // implausibly tight spread that would overstate confidence.
    weeklySd: measured === null ? DEFAULT_WEEKLY_SD : Math.max(measured, 15),
    sdMeasured: measured !== null,
  };
}

/** Standard normal CDF (Abramowitz-Stegun erf approximation). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-((z / Math.SQRT2) ** 2)));
  const erf = z >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

/**
 * P(A outscores B) from their season scoring averages. Both teams'
 * weekly scores are treated as independent draws with the same spread,
 * so the margin is normal with sd = weeklySd * sqrt(2).
 */
export function seasonWinProbability(meanA: number, meanB: number, weeklySd: number): number {
  const spread = weeklySd * Math.SQRT2;
  if (spread <= 0) return 0.5;
  return normalCdf((meanA - meanB) / spread);
}
