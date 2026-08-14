import { useCallback, useEffect, useState } from "react";
import { fetchPredictions, type PredictionRow } from "./predictions";

export interface PredictionsState {
  data: PredictionRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Loads shared predictions for a league from Supabase, with manual refresh. */
export function usePredictions(leagueId: string): PredictionsState {
  const [data, setData] = useState<PredictionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPredictions(leagueId)
      .then((rows) => {
        if (!cancelled) {
          setData(rows);
          setLoading(false);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load predictions");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, nonce]);

  return { data, loading, error, refresh };
}
