// Vercel serverless function - proxies FantasyPros' consensus-rankings
// API. Never called with the API key from the browser: that key stays
// server-side only (FANTASYPROS_API_KEY, set in Vercel's project env
// vars, no VITE_ prefix so it's never bundled into client JS).
//
// FantasyPros' free tier allows 50 requests/day *total*, shared across
// everything using this key. This function is the only thing allowed to
// spend that budget, and it only does so when the Supabase-backed cache
// for a given position group is older than CACHE_TTL_MS - however many
// times this endpoint itself gets hit (by one visitor or a hundred),
// the real upstream call happens at most once per TTL window per
// position group.
import { createClient } from "@supabase/supabase-js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h - a couple of real calls/day, well under 50
const HALF_PPR = "HALF";

// The free tier hard-caps every response at the top 10 players,
// regardless of which position is queried (confirmed live: the response
// carries "public_api_limited": true and "limit": 10). A blended "OP"
// (QB/RB/WR) request would burn most of those 10 slots on QBs alone -
// this league's real 2026 consensus has 6-7 QBs inside the overall top
// 10 - and return almost no RB/WR depth. Querying each position on its
// own instead gets the real top 10 *within* that position, which is
// both more useful for actual draft-day comparisons and a better use of
// the same 4 requests. K/DEF are left to Sleeper's own data: there's so
// little real skill differentiation there that spending API quota on
// them isn't worth it.
const GROUPS = [
  { cacheKey: "fp-qb-half", position: "QB" },
  { cacheKey: "fp-rb-half", position: "RB" },
  { cacheKey: "fp-wr-half", position: "WR" },
  { cacheKey: "fp-te-half", position: "TE" },
];

async function fetchFromCache(supabase, cacheKey) {
  const { data, error } = await supabase
    .from("fantasypros_cache")
    .select("data, fetched_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function fetchFromFantasyPros(apiKey, position) {
  const year = new Date().getFullYear();
  const url = `https://api.fantasypros.com/public/v2/json/nfl/${year}/consensus-rankings?type=ST&position=${position}&scoring=${HALF_PPR}`;
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  if (!res.ok) {
    throw new Error(`FantasyPros request failed for ${position}: ${res.status}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  const apiKey = process.env.FANTASYPROS_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: "Supabase isn't configured for this deployment." });
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const result = {};
  const errors = [];

  for (const group of GROUPS) {
    const cached = await fetchFromCache(supabase, group.cacheKey);
    const isFresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS;

    if (isFresh) {
      result[group.position] = { ...cached.data, cached: true, fetchedAt: cached.fetched_at };
      continue;
    }

    if (!apiKey) {
      // No key configured - serve whatever's cached (even if stale)
      // rather than fail the whole response.
      if (cached) {
        result[group.position] = { ...cached.data, cached: true, stale: true, fetchedAt: cached.fetched_at };
      } else {
        errors.push(`${group.position}: no cache and no API key configured`);
      }
      continue;
    }

    try {
      const fresh = await fetchFromFantasyPros(apiKey, group.position);
      const fetchedAt = new Date().toISOString();
      await supabase
        .from("fantasypros_cache")
        .upsert({ cache_key: group.cacheKey, data: fresh, fetched_at: fetchedAt });
      result[group.position] = { ...fresh, cached: false, fetchedAt };
    } catch (err) {
      // Upstream failed (rate limit, outage, etc.) - fall back to
      // whatever's cached, even stale, rather than show nothing.
      if (cached) {
        result[group.position] = { ...cached.data, cached: true, stale: true, fetchedAt: cached.fetched_at };
      } else {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  if (Object.keys(result).length === 0) {
    res.status(502).json({ error: errors.join("; ") || "Failed to load rankings" });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  res.status(200).json({ groups: result, errors: errors.length > 0 ? errors : undefined });
}
