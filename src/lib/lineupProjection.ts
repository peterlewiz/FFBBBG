import type { DraftPlayer } from "./players";
import type { RosterSlot } from "./useTeamRosters";

/** NFL games per team in a season - 18 weeks, one of them a bye. A
 * season-long projection divided by this is that player's average week. */
const GAMES_PER_SEASON = 17;

/**
 * FantasyPros' feed here covers QB/RB/WR/TE only - kickers and defenses
 * aren't worth the quota for draft purposes, which is what that data was
 * fetched for. Both are low-spread positions where the choice of starter
 * barely moves a weekly total, so a flat league-average week is a fair
 * stand-in rather than a gap in the estimate.
 */
const FLAT_WEEKLY_POINTS: Record<string, number> = { K: 8, DEF: 7 };

/**
 * What to assume for a starter with no projection at all - a deep waiver
 * add the expert data doesn't cover. Deliberately low: someone outside
 * FantasyPros' ranked depth is a fringe starter, and assuming an average
 * week for them would quietly flatter whichever team is starting the
 * most unknowns.
 */
const UNKNOWN_WEEKLY_POINTS: Record<string, number> = { QB: 12, RB: 6, WR: 6, TE: 4 };

/** Injury tags that mean no points at all this week. Sleeper's exact
 * strings, which is why "Out" and "IR" appear rather than a tidier set. */
const OUT_STATUSES = new Set(["Out", "IR", "Doubtful", "PUP", "Suspended", "NA", "Sus"]);
/** A questionable player usually plays, but a chunk of the time they sit
 * or leave early, so their projection gets a haircut rather than a zero. */
const QUESTIONABLE_FACTOR = 0.85;

export interface LineupProjection {
  /** Projected half-PPR points for the starting lineup this week. */
  points: number;
  /** Starting slots carrying a real expert projection, and the total -
   * the ratio is how much of this number is measured vs assumed. */
  projectedSlots: number;
  totalSlots: number;
  /** Starters sitting this week, for explaining a low number. */
  onBye: string[];
  out: string[];
  /** Starting slots left empty by the manager. */
  emptySlots: number;
}

function weeklyBase(player: DraftPlayer): number {
  if (player.projectedPoints !== null) return player.projectedPoints / GAMES_PER_SEASON;
  return FLAT_WEEKLY_POINTS[player.position] ?? UNKNOWN_WEEKLY_POINTS[player.position] ?? 0;
}

/**
 * A starting lineup's projected points for one week.
 *
 * Built from FantasyPros' season-long half-PPR projections rather than
 * week-specific ones (the proxy only fetches week=0, which is what the
 * draft assistant needs), so the per-player figure is their average week
 * rather than a read on this week's opponent. The two effects that
 * actually decide a fantasy week are applied on top: a starter on bye
 * scores nothing, and one already ruled out scores nothing. Both are
 * worth far more than matchup nuance - a lineup with two byes in it is
 * wrong by 25 points, not by 2.
 */
export function projectStarters(starters: RosterSlot[], week: number): LineupProjection {
  let points = 0;
  let projectedSlots = 0;
  let emptySlots = 0;
  const onBye: string[] = [];
  const out: string[] = [];

  for (const slot of starters) {
    const player = slot.player;
    if (!player) {
      // An unmatched id is still a real player Sleeper is starting, so
      // it shouldn't read as an empty slot - it just has no projection.
      if (slot.playerId) points += UNKNOWN_WEEKLY_POINTS.WR;
      else emptySlots++;
      continue;
    }
    if (player.projectedPoints !== null) projectedSlots++;

    if (player.byeWeek !== null && player.byeWeek === week) {
      onBye.push(player.name);
      continue;
    }
    const status = player.injuryStatus;
    if (status && OUT_STATUSES.has(status)) {
      out.push(player.name);
      continue;
    }
    const base = weeklyBase(player);
    points += status === "Questionable" ? base * QUESTIONABLE_FACTOR : base;
  }

  return { points, projectedSlots, totalSlots: starters.length, onBye, out, emptySlots };
}
