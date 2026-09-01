// Vercel serverless function - proxies FantasyPros' consensus-rankings
// and projections APIs. Never called with the API key from the browser:
// that key stays server-side only (FANTASYPROS_API_KEY, set in Vercel's
// project env vars, no VITE_ prefix so it's never bundled into client
// JS).
//
// Now on the premium tier (500 requests/day, full-depth responses - no
// more 10-player cap). Still cached in Supabase rather than fetched on
// every page view: no reason to burn quota re-fetching data that's only
// going to change a handful of times a day, and it keeps this resilient
// if the plan ever reverts to free.
import { createClient } from "@supabase/supabase-js";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h - plenty of headroom on 500/day, fresher than before
const HALF_PPR = "HALF";

// FantasyPros' own CDN caches responses by URL, independent of the
// calling account's plan - confirmed live: right after upgrading to
// premium, the *exact same request* kept coming back tagged
// "tier": "free" with the old 10-player cap until a cache-busting query
// param forced a miss. Every upstream call includes one for exactly
// this reason - without it, a plan upgrade (or any account change)
// could silently keep serving stale entitlements indefinitely.
function cacheBustedUrl(url) {
  const u = new URL(url);
  u.searchParams.set("_cb", Date.now().toString());
  return u.toString();
}

// Rankings: real expert consensus (ECR), full depth per position now.
// Projections: real projected 2026 season stats, including points_half -
// this league's actual scoring format - which is what makes genuine
// "value over consensus" comparisons possible (see src/lib/players.ts).
const POSITIONS = ["QB", "RB", "WR", "TE"];
const GROUPS = POSITIONS.flatMap((position) => [
  {
    cacheKey: `fp-rank-${position.toLowerCase()}-half`,
    kind: "rankings",
    position,
    url: (year) =>
      `https://api.fantasypros.com/public/v2/json/nfl/${year}/consensus-rankings?type=ST&position=${position}&scoring=${HALF_PPR}`,
  },
  {
    cacheKey: `fp-proj-${position.toLowerCase()}-half`,
    kind: "projections",
    position,
    url: (year) =>
      `https://api.fantasypros.com/public/v2/json/nfl/${year}/projections?position=${position}&week=0&scoring=${HALF_PPR}`,
  },
]);

async function fetchFromCache(supabase, cacheKey) {
  const { data, error } = await supabase
    .from("fantasypros_cache")
    .select("data, fetched_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error) return { row: null, error };
  return { row: data, error: null };
}

async function fetchFromFantasyPros(apiKey, urlBuilder) {
  const year = new Date().getFullYear();
  const res = await fetch(cacheBustedUrl(urlBuilder(year)), {
    headers: { "x-api-key": apiKey, "Cache-Control": "no-cache" },
  });
  if (!res.ok) {
    throw new Error(`FantasyPros request failed (${res.status})`);
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

  const debug = req.query?.debug === "1";
  const rankings = {};
  const projections = {};
  const errors = [];
  const debugInfo = {};

  for (const group of GROUPS) {
    const target = group.kind === "rankings" ? rankings : projections;
    const { row: cached, error: readError } = await fetchFromCache(supabase, group.cacheKey);
    if (readError && debug) debugInfo[group.cacheKey] = { readError: readError.message };
    const isFresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS;

    // A broken cache (missing table, bad RLS, etc.) must never turn into
    // "call FantasyPros on every single request" - if we can't even read
    // the cache, surface the error instead of silently falling through
    // to a real upstream call.
    if (readError) {
      errors.push(`${group.cacheKey}: cache read failed - ${readError.message}`);
      continue;
    }

    if (isFresh) {
      target[group.position] = { ...cached.data, cached: true, fetchedAt: cached.fetched_at };
      continue;
    }

    if (!apiKey) {
      if (cached) {
        target[group.position] = { ...cached.data, cached: true, stale: true, fetchedAt: cached.fetched_at };
      } else {
        errors.push(`${group.cacheKey}: no cache and no API key configured`);
      }
      continue;
    }

    try {
      const fresh = await fetchFromFantasyPros(apiKey, group.url);
      const fetchedAt = new Date().toISOString();
      const { error: writeError } = await supabase
        .from("fantasypros_cache")
        .upsert({ cache_key: group.cacheKey, data: fresh, fetched_at: fetchedAt });
      if (writeError) {
        errors.push(`${group.cacheKey}: cache write failed (will re-fetch next time) - ${writeError.message}`);
        if (debug) debugInfo[group.cacheKey] = { ...debugInfo[group.cacheKey], writeError: writeError.message };
      }
      target[group.position] = { ...fresh, cached: false, fetchedAt };
    } catch (err) {
      if (cached) {
        target[group.position] = { ...cached.data, cached: true, stale: true, fetchedAt: cached.fetched_at };
      } else {
        errors.push(`${group.cacheKey}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (Object.keys(rankings).length === 0 && Object.keys(projections).length === 0) {
    res.status(502).json({ error: errors.join("; ") || "Failed to load rankings", debug: debug ? debugInfo : undefined });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  res.status(200).json({
    rankings,
    projections,
    errors: errors.length > 0 ? errors : undefined,
    debug: debug ? debugInfo : undefined,
  });
}
