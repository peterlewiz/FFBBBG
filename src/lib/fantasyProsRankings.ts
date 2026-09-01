export interface FantasyProsPlayer {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  team: string | null;
  /** Comparable across QB/RB/WR (FantasyPros' blended "OP" ranking).
   * For TE this is only comparable to other TEs - see
   * `mergeExpertRankings`'s tier-anchoring for a full-board estimate. */
  rankEcr: number;
  posRank: string;
  tier: number;
  byeWeek: number | null;
}

export interface FantasyProsData {
  players: FantasyProsPlayer[];
  fetchedAt: string | null;
  stale: boolean;
  totalExperts: number | null;
}

interface RawPlayer {
  player_name: string;
  player_position_id: string;
  player_team_id: string | null;
  rank_ecr: number;
  pos_rank: string;
  tier: number;
  player_bye_week: string | null;
}

interface RawGroup {
  players: RawPlayer[];
  total_experts?: number;
  cached: boolean;
  stale?: boolean;
  fetchedAt: string;
}

const KNOWN_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

function mapPlayer(p: RawPlayer): FantasyProsPlayer | null {
  if (!KNOWN_POSITIONS.has(p.player_position_id)) return null;
  return {
    name: p.player_name,
    position: p.player_position_id as FantasyProsPlayer["position"],
    team: p.player_team_id || null,
    rankEcr: p.rank_ecr,
    posRank: p.pos_rank,
    tier: p.tier,
    byeWeek: p.player_bye_week ? Number(p.player_bye_week) : null,
  };
}

/**
 * Fetches expert consensus rankings via our own /api/rankings proxy -
 * never calls FantasyPros directly from the browser (see api/rankings.js
 * for why: the API key and its 50-requests/day cap have to stay
 * server-side). Returns [] rather than throwing if unavailable, since
 * the draft board should still work off Sleeper's data alone.
 */
export async function fetchFantasyProsRankings(): Promise<FantasyProsData> {
  const empty: FantasyProsData = { players: [], fetchedAt: null, stale: false, totalExperts: null };
  let res: Response;
  try {
    res = await fetch("/api/rankings");
  } catch {
    return empty; // e.g. running vite dev directly with no serverless functions
  }
  if (!res.ok) return empty;

  const json: { groups?: Record<string, RawGroup> } = await res.json().catch(() => ({}));
  const players: FantasyProsPlayer[] = [];
  let fetchedAt: string | null = null;
  let stale = false;
  let totalExperts: number | null = null;

  for (const group of Object.values(json.groups ?? {})) {
    for (const raw of group.players ?? []) {
      const mapped = mapPlayer(raw);
      if (mapped) players.push(mapped);
    }
    if (group.fetchedAt) fetchedAt = group.fetchedAt;
    if (group.stale) stale = true;
    if (group.total_experts) totalExperts = group.total_experts;
  }

  return { players, fetchedAt, stale, totalExperts };
}

/** Strip punctuation/suffixes so "A.J. Brown" and "AJ Brown Jr." both
 * normalize the same way for matching Sleeper's and FantasyPros' names. */
export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'']/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .trim();
}
