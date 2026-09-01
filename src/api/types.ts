// Types for the subset of the Sleeper API (api.sleeper.app) this app uses.
// Docs: https://docs.sleeper.com/

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  season_type: string;
  status: string; // "pre_draft" | "drafting" | "in_season" | "complete"
  previous_league_id: string | null;
  total_rosters: number;
  /** League logo id; render via https://sleepercdn.com/avatars/<avatar>. */
  avatar: string | null;
  draft_id: string | null;
  settings: {
    playoff_week_start?: number;
    playoff_teams?: number;
    num_teams?: number;
    /** How many players each team may keep into the next draft. */
    max_keepers?: number;
    trade_deadline?: number;
    /** FAAB budget if using budget-based waivers; 0/absent for rolling
     * priority waivers. */
    waiver_budget?: number;
    best_ball?: number; // 0 = normal lineup management, 1 = best ball
    [key: string]: unknown;
  };
  /** Points awarded per statistical event - this league's actual scoring,
   * not Sleeper's defaults. Keys are Sleeper's stat codes (e.g. "rec",
   * "pass_td", "pts_allow_0"); see docs.sleeper.com for the full list. */
  scoring_settings: Record<string, number>;
  /** One entry per roster slot, including bench - e.g.
   * ["QB","RB","RB","WR","WR","TE","FLEX","K","DEF","BN","BN",...]. */
  roster_positions: string[];
}

export interface SleeperDraft {
  draft_id: string;
  status: string; // "pre_draft" | "drafting" | "complete"
  type?: string; // "snake" | "linear" | "auction"
  season?: string;
  /** Scheduled start, epoch milliseconds. Null until the commissioner sets it. */
  start_time: number | null;
  /** user_id -> pick slot (1 = first overall). Set once the commissioner
   * randomizes/sets the order, even before the draft itself happens. */
  draft_order?: Record<string, number> | null;
  /** pick slot -> roster_id, the mapping SleeperDraftPick.roster_id is
   * actually in terms of. */
  slot_to_roster_id?: Record<string, number> | null;
  metadata?: {
    name?: string;
    scoring_type?: string;
    [key: string]: unknown;
  };
  settings?: {
    rounds?: number;
    teams?: number;
    slots_qb?: number;
    slots_rb?: number;
    slots_wr?: number;
    slots_te?: number;
    slots_flex?: number;
    slots_k?: number;
    slots_def?: number;
    slots_bn?: number;
    pick_timer?: number;
    [key: string]: unknown;
  };
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  metadata: {
    team_name?: string;
    avatar?: string;
    [key: string]: unknown;
  };
  avatar: string | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against: number;
    fpts_against_decimal?: number;
    [key: string]: unknown;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
}

// One entry in the winners bracket. `p` is the placement decided by this
// match (e.g. p:1 = championship game, p:3 = 3rd place game). `w`/`l` are
// roster_ids of the winner/loser once played.
export interface SleeperBracketMatch {
  r: number; // round
  m: number; // match id
  t1: number | null;
  t2: number | null;
  w: number | null;
  l: number | null;
  p?: number;
}

// The league-agnostic "what week is it" clock Sleeper's own app uses.
// This is the authoritative source for "the upcoming week to predict" -
// unlike inferring it from matchup data, which is unreliable once a
// season's full schedule (including unplayed future weeks) is loaded.
export interface SleeperNflState {
  week: number;
  season: string;
  season_type: string; // "pre" | "regular" | "post"
  display_week: number;
}

// One entry in the ~12k-player universe from GET /players/nfl (a ~15MB
// blob covering every player Sleeper has ever tracked, most of them long
// retired or irrelevant). Only the fields the draft assistant needs.
export interface SleeperPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position: string | null; // "QB" | "RB" | "WR" | "TE" | "K" | "DEF" | ...
  team: string | null; // NFL team abbreviation, null if unrostered/retired
  active: boolean;
  /** Sleeper's own overall relevance ranking - lower is more relevant.
   * Roughly tracks ADP/consensus value; not a projection. 9999999 for
   * players with no meaningful ranking. */
  search_rank?: number;
  years_exp?: number | null;
  age?: number | null;
  status?: string | null; // "Active" | "Inactive" | "Injured Reserve" | ...
  injury_status?: string | null; // "Questionable" | "Out" | "IR" | null
}

/** One completed pick from GET /draft/{id}/picks - empty array until the
 * draft actually starts. */
export interface SleeperDraftPick {
  pick_no: number;
  round: number;
  roster_id: number;
  player_id: string;
  picked_by: string; // user_id
}
