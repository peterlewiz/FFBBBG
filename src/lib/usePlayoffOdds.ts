import { useEffect, useMemo, useState } from "react";
import { useLeagueHistory } from "./useLeagueHistory";
import { useNflState } from "./useNflState";
import { computeEloRatings } from "./elo";
import { simulatePlayoffOdds, type PlayoffOddsResult } from "./playoffOdds";
import { fetchPreviousSnapshot, saveSnapshot } from "./playoffOddsSnapshots";
import { ROOT_LEAGUE_ID } from "./history";

export interface PlayoffOddsDelta {
  playoffDelta: number | null; // null if no prior snapshot to compare against
  titleDelta: number | null;
}

export interface PlayoffOddsState {
  data: PlayoffOddsResult | null;
  /** The week the comparison snapshot is from, null if there isn't one yet. */
  previousWeek: number | null;
  deltas: Record<string, PlayoffOddsDelta>;
  loading: boolean;
  error: string | null;
}

/**
 * Runs the Monte Carlo playoff simulation for the current season and
 * loads/saves the weekly snapshot it's diffed against. The simulation
 * itself is synchronous (just CPU, no network) but memoized so it only
 * reruns when the underlying history actually changes.
 */
export function usePlayoffOdds(): PlayoffOddsState {
  const { data: history, loading: historyLoading, error: historyError } = useLeagueHistory();
  const { state: nflState } = useNflState();

  const result = useMemo(() => {
    if (!history) return null;
    const eloResult = computeEloRatings(history);
    return simulatePlayoffOdds(history, eloResult);
  }, [history]);

  const [previousWeek, setPreviousWeek] = useState<number | null>(null);
  const [deltas, setDeltas] = useState<Record<string, PlayoffOddsDelta>>({});

  useEffect(() => {
    if (!result || nflState === null) return;
    let cancelled = false;

    fetchPreviousSnapshot(ROOT_LEAGUE_ID, result.season, nflState.week)
      .then((previous) => {
        if (cancelled) return;
        if (!previous) {
          setPreviousWeek(null);
          setDeltas({});
          return;
        }
        setPreviousWeek(previous.week);
        const next: Record<string, PlayoffOddsDelta> = {};
        for (const entry of result.entries) {
          const prior = previous.byUserId[entry.userId];
          next[entry.userId] = {
            playoffDelta: prior ? entry.playoffPct - prior.playoff_pct : null,
            titleDelta: prior ? entry.titlePct - prior.title_pct : null,
          };
        }
        setDeltas(next);
      })
      .catch(() => {
        // Non-fatal - the page still works without deltas.
        if (!cancelled) {
          setPreviousWeek(null);
          setDeltas({});
        }
      });

    // Best-effort: record this week's number so a future visit (this
    // week or next) has something to diff against. Not awaited - the
    // page doesn't need to wait on this to render.
    saveSnapshot(ROOT_LEAGUE_ID, nflState.week, result);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `result` is a
    // fresh object each render; keying on its identity would refetch/resave
    // every render. season+asOfWeek is what actually determines the answer.
  }, [result?.season, result?.asOfWeek, nflState?.week]);

  return {
    data: result,
    previousWeek,
    deltas,
    loading: historyLoading,
    error: historyError,
  };
}
