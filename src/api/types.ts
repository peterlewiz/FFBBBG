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
    [key: string]: unknown;
  };
}

export interface SleeperDraft {
  draft_id: string;
  status: string; // "pre_draft" | "drafting" | "complete"
  /** Scheduled start, epoch milliseconds. Null until the commissioner sets it. */
  start_time: number | null;
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
