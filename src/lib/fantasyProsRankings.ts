export interface FantasyProsPlayer {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  team: string | null;
  /** Real expert consensus rank within this position (full depth on the
   * premium tier - null only if this player wasn't ranked at all). */
  rankEcr: number | null;
  posRank: string | null;
  tier: number | null;
  byeWeek: number | null;
  /** FantasyPros' projected half-PPR points for the full season. */
  projectedPoints: number | null;
  /** This player's rank within their position if sorted purely by
   * projectedPoints - the "what the numbers say" side of a value gap. */
  projectedRank: number | null;
}

export interface FantasyProsData {
  players: FantasyProsPlayer[];
  fetchedAt: string | null;
  stale: boolean;
  /** True once responses are coming back at full depth (premium) rather
   * than the free tier's 10-per-position cap. */
  fullDepth: boolean;
}

interface RawRankingsPlayer {
  player_name: string;
  player_position_id: string;
  player_team_id: string | null;
  rank_ecr: number;
  pos_rank: string;
  tier: number;
  player_bye_week: string | null;
}

interface RawRankingsGroup {
  players: RawRankingsPlayer[];
  cached: boolean;
  stale?: boolean;
  fetchedAt: string;
}

interface RawProjectionsPlayer {
  name: string;
  position_id: string;
  team_id: string | null;
  stats?: { points_half?: number };
}

interface RawProjectionsGroup {
  players: RawProjectionsPlayer[];
  cached: boolean;
  stale?: boolean;
  fetchedAt: string;
}

const KNOWN_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

/** Strip punctuation/suffixes so "A.J. Brown" and "AJ Brown Jr." both
 * normalize the same way for matching across data sources. */
export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'']/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .trim();
}

function key(name: string, position: string): string {
  return `${normalizePlayerName(name)}|${position}`;
}

/**
 * Fetches expert consensus + projections via our own /api/rankings proxy
 * - never calls FantasyPros directly from the browser (see
 * api/rankings.js for why: the API key and its quota have to stay
 * server-side). Returns an empty result rather than throwing if
 * unavailable, since the draft board should still work off Sleeper's
 * data alone.
 */
export async function fetchFantasyProsRankings(): Promise<FantasyProsData> {
  const empty: FantasyProsData = { players: [], fetchedAt: null, stale: false, fullDepth: false };
  let res: Response;
  try {
    res = await fetch("/api/rankings");
  } catch {
    return empty; // e.g. running vite dev directly with no serverless functions
  }
  if (!res.ok) return empty;

  const json: { rankings?: Record<string, RawRankingsGroup>; projections?: Record<string, RawProjectionsGroup> } =
    await res.json().catch(() => ({}));

  const byKey = new Map<string, FantasyProsPlayer>();
  let fetchedAt: string | null = null;
  let stale = false;
  let fullDepth = false;

  function ensure(name: string, position: FantasyProsPlayer["position"], team: string | null) {
    const k = key(name, position);
    let p = byKey.get(k);
    if (!p) {
      p = {
        name,
        position,
        team,
        rankEcr: null,
        posRank: null,
        tier: null,
        byeWeek: null,
        projectedPoints: null,
        projectedRank: null,
      };
      byKey.set(k, p);
    }
    return p;
  }

  for (const group of Object.values(json.rankings ?? {})) {
    if (group.fetchedAt) fetchedAt = group.fetchedAt;
    if (group.stale) stale = true;
    if ((group.players?.length ?? 0) > 10) fullDepth = true;
    for (const raw of group.players ?? []) {
      if (!KNOWN_POSITIONS.has(raw.player_position_id)) continue;
      const p = ensure(
        raw.player_name,
        raw.player_position_id as FantasyProsPlayer["position"],
        raw.player_team_id || null,
      );
      p.rankEcr = raw.rank_ecr;
      p.posRank = raw.pos_rank;
      p.tier = raw.tier;
      p.byeWeek = raw.player_bye_week ? Number(raw.player_bye_week) : null;
    }
  }

  for (const group of Object.values(json.projections ?? {})) {
    if (group.fetchedAt) fetchedAt = group.fetchedAt;
    if (group.stale) stale = true;
    for (const raw of group.players ?? []) {
      if (!KNOWN_POSITIONS.has(raw.position_id)) continue;
      const points = raw.stats?.points_half;
      if (points === undefined) continue;
      const p = ensure(raw.name, raw.position_id as FantasyProsPlayer["position"], raw.team_id || null);
      p.projectedPoints = points;
    }
  }

  // Rank within each position purely by projected points, independent of
  // (and comparable against) the expert consensus rank above.
  const byPosition = new Map<string, FantasyProsPlayer[]>();
  for (const p of byKey.values()) {
    if (p.projectedPoints === null) continue;
    const arr = byPosition.get(p.position) ?? [];
    arr.push(p);
    byPosition.set(p.position, arr);
  }
  for (const arr of byPosition.values()) {
    arr.sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0));
    arr.forEach((p, i) => (p.projectedRank = i + 1));
  }

  return { players: Array.from(byKey.values()), fetchedAt, stale, fullDepth };
}
