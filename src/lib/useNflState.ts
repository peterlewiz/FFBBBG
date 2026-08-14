import { useEffect, useState } from "react";
import { getNflState } from "../api/sleeper";
import type { SleeperNflState } from "../api/types";

/**
 * Sleeper's own clock is the authoritative "what week is it". Inferring
 * the week from league data doesn't work: once a season is underway
 * Sleeper exposes the whole schedule, so the highest week present is the
 * last week of the season, not the current one.
 */

// One request per page load, shared by every page that asks.
let pending: Promise<SleeperNflState> | null = null;

function loadNflState(): Promise<SleeperNflState> {
  if (!pending) {
    pending = getNflState().catch((err) => {
      // Don't cache a rejection - let the next mount retry.
      pending = null;
      throw err;
    });
  }
  return pending;
}

export function useNflState(): { state: SleeperNflState | null; error: string | null } {
  const [state, setState] = useState<SleeperNflState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNflState()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load the current week");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, error };
}
