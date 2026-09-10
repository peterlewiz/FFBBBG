import { useEffect, useRef, useState } from "react";
import { getMatchups } from "../api/sleeper";

// Re-checked while the page sits open so a tab loaded before kickoff
// locks itself rather than staying editable until someone reloads.
const POLL_MS = 60_000;

export interface WeekLockState {
  /**
   * Whether any team in the league has scored this week - i.e. whether
   * an NFL game is in progress or finished. Null while unknown (first
   * load, or the fetch failed), so callers can fall back rather than
   * guessing in either direction.
   */
  anyPointsScored: boolean | null;
  /** matchup_id -> highest points either side has, for per-matchup detail. */
  pointsByMatchup: Map<number, number>;
}

/**
 * Live "has this week started?" check, read straight from Sleeper rather
 * than from the cached league history.
 *
 * The history cache has a 45-minute TTL, so deriving the lock from it
 * meant picks could stay open for up to 45 minutes after kickoff - long
 * enough to watch a game and then pick. This endpoint is a single small
 * request, so it can be read fresh and polled.
 *
 * Before any game kicks off every roster really is 0.0, so a points
 * check can't lock the week early.
 */
export function useWeekLock(leagueId: string, week: number | null): WeekLockState {
  const [state, setState] = useState<WeekLockState>({
    anyPointsScored: null,
    pointsByMatchup: new Map(),
  });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (week === null) {
      setState({ anyPointsScored: null, pointsByMatchup: new Map() });
      return;
    }

    async function tick() {
      try {
        const rows = await getMatchups(leagueId, week as number);
        if (cancelled) return;
        const byMatchup = new Map<number, number>();
        let any = false;
        for (const r of rows) {
          const pts = r.points ?? 0;
          if (pts > 0) any = true;
          if (r.matchup_id !== null) {
            byMatchup.set(r.matchup_id, Math.max(byMatchup.get(r.matchup_id) ?? 0, pts));
          }
        }
        setState({ anyPointsScored: any, pointsByMatchup: byMatchup });
      } catch {
        // Leave it unknown rather than reporting "no games started" - the
        // caller falls back to the cached-history signal instead, so a
        // blip degrades to the old behaviour instead of unlocking picks.
        if (!cancelled) setState((prev) => ({ ...prev, anyPointsScored: null }));
      } finally {
        if (!cancelled) timerRef.current = window.setTimeout(tick, POLL_MS);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [leagueId, week]);

  return state;
}
