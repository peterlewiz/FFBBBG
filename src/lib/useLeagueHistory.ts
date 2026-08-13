import { useEffect, useState } from "react";
import { loadLeagueHistory, type LeagueHistory } from "./history";

export interface LeagueHistoryState {
  data: LeagueHistory | null;
  loading: boolean;
  error: string | null;
}

/** Loads (and caches) the full league history once, shared by every page. */
export function useLeagueHistory(): LeagueHistoryState {
  const [state, setState] = useState<LeagueHistoryState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadLeagueHistory()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load league data",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
