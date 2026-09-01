import type { SleeperLeague } from "../api/types";
import type { LeagueHistory } from "./history";
import type { DraftPlayer, FantasyPosition } from "./players";

// ---------------------------------------------------------------------
// Snake draft pick math
// ---------------------------------------------------------------------

export interface DraftSlot {
  round: number;
  overall: number;
}

/**
 * Every pick a given slot makes across a snake draft. Round 1 goes
 * slot 1..N, round 2 reverses (N..1), etc. - the standard snake format
 * this league's draft (type: "snake") actually uses.
 */
export function computeSnakeDraftSlots(
  pickSlot: number,
  teams: number,
  rounds: number,
): DraftSlot[] {
  const out: DraftSlot[] = [];
  for (let round = 1; round <= rounds; round++) {
    const reversed = round % 2 === 0;
    const positionInRound = reversed ? teams - pickSlot + 1 : pickSlot;
    const overall = (round - 1) * teams + positionInRound;
    out.push({ round, overall });
  }
  return out;
}

/** How many picks (by other teams) happen between two of your own picks. */
export function picksUntilNext(slots: DraftSlot[], afterRound: number): number | null {
  const idx = slots.findIndex((s) => s.round === afterRound);
  if (idx === -1 || idx + 1 >= slots.length) return null;
  return slots[idx + 1].overall - slots[idx].overall - 1;
}

// ---------------------------------------------------------------------
// League rules, in plain English, computed live from the actual settings
// (never hardcoded numbers) so this stays correct if the commissioner
// changes something.
// ---------------------------------------------------------------------

export interface RuleFact {
  label: string;
  detail: string;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function explainScoringRules(league: SleeperLeague): RuleFact[] {
  const s = league.scoring_settings ?? {};
  const facts: RuleFact[] = [];

  const rec = s.rec ?? 0;
  facts.push({
    label: "Reception scoring",
    detail:
      rec === 0
        ? "Standard - no points per reception"
        : rec === 1
          ? "Full PPR - 1 pt per reception"
          : `${fmt(rec)} pt per reception (${rec < 1 ? "half" : "premium"}-PPR)`,
  });

  if (s.bonus_rec_te) {
    facts.push({
      label: "TE premium",
      detail: `Tight ends get an extra ${fmt(s.bonus_rec_te)} pt per reception on top of the base rate - real TE premium, draft one earlier than usual.`,
    });
  } else {
    facts.push({
      label: "TE premium",
      detail: "None - tight ends score the same per catch as RB/WR. No reason to reach for one early just because it's a TE-premium format.",
    });
  }

  if ((s.rush_att ?? 0) > 0) {
    facts.push({
      label: "Rush attempt bonus",
      detail: `${fmt(s.rush_att)} pt per carry, not just yardage - volume (bell-cow backs, goal-line work) is worth more here than in a pure efficiency league.`,
    });
  }
  if ((s.pass_att ?? 0) > 0) {
    facts.push({
      label: "Pass attempt bonus",
      detail: `${fmt(s.pass_att)} pt per pass attempt - rewards high-volume passers even on bad efficiency days.`,
    });
  }

  const milestoneBonuses = [
    ["bonus_rec_yd_100", "100 rec yds"],
    ["bonus_rush_yd_100", "100 rush yds"],
    ["bonus_rush_rec_yd_100", "100 rush+rec yds"],
    ["bonus_pass_yd_300", "300 pass yds"],
    ["bonus_pass_yd_400", "400 pass yds"],
  ] as const;
  const activeBonuses = milestoneBonuses.filter(([key]) => (s[key] ?? 0) > 0);
  facts.push({
    label: "Yardage milestone bonuses",
    detail:
      activeBonuses.length > 0
        ? activeBonuses.map(([key, label]) => `+${fmt(s[key])} at ${label}`).join(", ")
        : "None - no bonus for a 100-yard rushing/receiving game or a 300+ yard passing game.",
  });

  facts.push({
    label: "Passing vs. rushing/receiving TDs",
    detail: `Passing TD = ${fmt(s.pass_td ?? 0)} pts, rushing/receiving TD = ${fmt(s.rush_td ?? 0)} pts. ${
      (s.rush_td ?? 0) > (s.pass_td ?? 0)
        ? "Skill-position scores are worth more than a QB's - typical setup that keeps QBs from running away with value."
        : "Even weighting - a rushing/passing QB's own TDs count the same as anyone else's."
    }`,
  });

  facts.push({
    label: "Interceptions / fumbles lost",
    detail: `${fmt(s.pass_int ?? 0)} pts per INT thrown, ${fmt(s.fum_lost ?? 0)} pts per fumble lost.`,
  });

  // Team defense: the points-allowed ladder, only the tiers actually set.
  const paTiers: [string, string][] = [
    ["pts_allow_0", "Shutout"],
    ["pts_allow_1_6", "Allow 1-6"],
    ["pts_allow_7_13", "Allow 7-13"],
    ["pts_allow_14_20", "Allow 14-20"],
    ["pts_allow_21_27", "Allow 21-27"],
    ["pts_allow_28_34", "Allow 28-34"],
    ["pts_allow_35p", "Allow 35+"],
  ];
  const activeTiers = paTiers.filter(([key]) => s[key] !== undefined && s[key] !== 0);
  if (activeTiers.length > 0) {
    facts.push({
      label: "Team defense: points allowed",
      detail: activeTiers.map(([key, label]) => `${label}: ${fmt(s[key])}`).join(" · "),
    });
  }
  facts.push({
    label: "Team defense: turnovers/sacks",
    detail: `Sack ${fmt(s.sack ?? 0)}, INT ${fmt(s.int ?? 0)}, fumble recovery ${fmt(s.fum_rec ?? 0)}, defensive/return TD ${fmt(s.def_td ?? 0)}.`,
  });

  // Kicker
  const fgMissTiers: [string, string][] = [
    ["fgmiss_0_19", "0-19"],
    ["fgmiss_20_29", "20-29"],
    ["fgmiss_30_39", "30-39"],
    ["fgmiss_40_49", "40-49"],
    ["fgmiss_50p", "50+"],
  ];
  const penalizedMisses = fgMissTiers.filter(([key]) => (s[key] ?? 0) < 0);
  const unpenalizedMisses = fgMissTiers.filter(([key]) => (s[key] ?? 0) === 0);
  facts.push({
    label: "Kicker makes",
    detail: `Flat ${fmt(s.fgm ?? 0)} pts per field goal made${
      (s.fgm_yds_over_30 ?? 0) > 0
        ? `, plus ${fmt(s.fgm_yds_over_30)} pt per yard beyond 30 - long kicks are worth extra.`
        : ", regardless of distance."
    }`,
  });
  if (penalizedMisses.length > 0 || unpenalizedMisses.length > 0) {
    facts.push({
      label: "Kicker misses",
      detail: `Penalized: ${penalizedMisses.map(([, l]) => l).join(", ") || "none"}. Free pass: ${
        unpenalizedMisses.map(([, l]) => l).join(", ") || "none"
      }${unpenalizedMisses.some(([k]) => k === "fgmiss_50p") ? " - no risk in trying a long one." : ""}`,
    });
  }

  return facts;
}

export function explainRosterAndLeagueRules(league: SleeperLeague): RuleFact[] {
  const settings = league.settings ?? {};
  const positions = league.roster_positions ?? [];
  const starters = positions.filter((p) => p !== "BN");
  const bench = positions.filter((p) => p === "BN").length;
  const counts = new Map<string, number>();
  for (const p of starters) counts.set(p, (counts.get(p) ?? 0) + 1);

  const facts: RuleFact[] = [
    {
      label: "Starting lineup",
      detail: Array.from(counts.entries())
        .map(([pos, n]) => `${n} ${pos}`)
        .join(", "),
    },
    { label: "Bench spots", detail: `${bench}${settings.reserve_slots ? ` + ${settings.reserve_slots} IR` : ""}` },
    {
      label: "Teams / playoff field",
      detail: `${settings.num_teams ?? "?"} teams, top ${settings.playoff_teams ?? "?"} make the playoffs (weeks ${settings.playoff_week_start ?? "?"}+)`,
    },
  ];

  if (settings.max_keepers) {
    facts.push({
      label: "Keepers",
      detail: `League settings still show up to ${settings.max_keepers} keeper(s) allowed, but this has reportedly been removed for this season - confirm with the commissioner before assuming anyone kept a player.`,
    });
  }

  if (settings.trade_deadline) {
    facts.push({ label: "Trade deadline", detail: `Week ${settings.trade_deadline}` });
  }

  if (settings.waiver_budget) {
    facts.push({
      label: "Waivers",
      detail: `FAAB-style budget: $${settings.waiver_budget} for the season.`,
    });
  } else {
    facts.push({ label: "Waivers", detail: "Rolling priority (no FAAB budget)." });
  }

  if (settings.best_ball) {
    facts.push({ label: "Format", detail: "Best ball - no weekly lineup management." });
  }

  return facts;
}

// ---------------------------------------------------------------------
// Positional scarcity: starting demand across the whole league vs. the
// depth of realistically-relevant players at that position.
// ---------------------------------------------------------------------

export interface ScarcityRow {
  position: FantasyPosition;
  /** Total starting slots across the whole league, FLEX split evenly
   * across its eligible positions. */
  demand: number;
  /** How many players are drafted before this position is functionally
   * "bench-only" replacement-level, given the pool available. */
  startablePool: number;
  ratio: number; // demand / startablePool - higher = scarcer
}

const FLEX_ELIGIBLE: FantasyPosition[] = ["RB", "WR", "TE"];

// How much deeper than bare starting demand a position's realistically
// "startable" pool runs, before it's true deep-bench/streamer territory.
// These aren't from this league's data - they're well-established
// fantasy roster-construction facts: RB and TE fall off a cliff after
// their top tier (committee backfields, a handful of true difference-
// making TEs), QB and WR run deep enough to stream/plug in comfortably,
// and K/DEF are notoriously undifferentiated waiver-to-waiver.
const DEPTH_MULTIPLIER: Record<FantasyPosition, number> = {
  QB: 2.0,
  RB: 1.5,
  WR: 2.5,
  TE: 1.6,
  K: 1.3,
  DEF: 1.3,
};

export function computePositionalScarcity(
  league: SleeperLeague,
  players: DraftPlayer[],
): ScarcityRow[] {
  const teams = league.settings?.num_teams ?? 12;
  const positions = league.roster_positions ?? [];

  const demand: Record<FantasyPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  const flexSlots = positions.filter((p) => p === "FLEX" || p === "SUPER_FLEX").length;
  for (const p of positions) {
    if (p in demand) demand[p as FantasyPosition] += teams;
  }
  // Split FLEX demand evenly across its eligible positions (a simplification -
  // real FLEX usage skews RB/WR, but this gives a fair scarcity baseline).
  for (const pos of FLEX_ELIGIBLE) {
    demand[pos] += (teams * flexSlots) / FLEX_ELIGIBLE.length;
  }

  const byPosition: Record<FantasyPosition, DraftPlayer[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DEF: [],
  };
  for (const p of players) byPosition[p.position].push(p);

  const rows: ScarcityRow[] = [];
  for (const position of Object.keys(demand) as FantasyPosition[]) {
    // Team defenses carry no search_rank at all in Sleeper's data (there's
    // no per-defense "relevance" signal, just 32 real teams) - the rank
    // filter that trims skill-position scrubs would wrongly zero out
    // every DEF entry, since they'd all sit at the "unranked" sentinel.
    const pool =
      position === "DEF" ? byPosition[position] : byPosition[position].filter((p) => p.searchRank < 9999999);
    const startablePool = Math.max(
      1,
      Math.min(Math.round(demand[position] * DEPTH_MULTIPLIER[position]), pool.length || 1),
    );
    rows.push({
      position,
      demand: demand[position],
      startablePool,
      ratio: demand[position] / startablePool,
    });
  }
  return rows.sort((a, b) => b.ratio - a.ratio);
}

// ---------------------------------------------------------------------
// League vulnerabilities, mined from this league's own multi-season
// history - real numbers, not guesses.
// ---------------------------------------------------------------------

export interface PlayoffLineYear {
  season: string;
  /** Points scored by the last team that made the playoffs that season. */
  cutoffPoints: number;
  /** Points scored by the first team that missed. */
  missedByPoints: number;
}

/** How many points it actually took to make the playoffs, per season -
 * a real target, not a guess, for "how good does my team need to be". */
export function computeHistoricalPlayoffLine(history: LeagueHistory): PlayoffLineYear[] {
  const out: PlayoffLineYear[] = [];
  for (const season of history.seasons) {
    if (season.status !== "complete" || !season.playoffTeams || season.rosters.length === 0) {
      continue;
    }
    const standings = season.rosters
      .filter((r) => r.ownerUserId)
      .map((r) => {
        const games = r.wins + r.losses + r.ties;
        return {
          winPct: games > 0 ? (r.wins + r.ties * 0.5) / games : 0,
          pointsFor: r.pointsFor,
        };
      })
      .sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor);
    const cutoff = standings[season.playoffTeams - 1];
    const missed = standings[season.playoffTeams];
    if (!cutoff) continue;
    out.push({
      season: season.season,
      cutoffPoints: cutoff.pointsFor,
      missedByPoints: missed?.pointsFor ?? cutoff.pointsFor,
    });
  }
  return out.reverse();
}
