import { useCallback, useEffect, useRef, useState } from "react";
import { getDraft, getDraftPicks } from "../api/sleeper";
import type { SleeperDraft, SleeperDraftPick } from "../api/types";

// A mock draft's pick timer is typically 30-90s (this one's is 60s), far
// shorter than the real draft's - 15s (useDraftLive's interval) would
// mean missing a full pick's worth of state on a fast room. Polling this
// much more often is fine: it's a single lightweight GET per tick, same
// endpoint useDraftLive already uses for the real draft.
const POLL_MS = 4000;

export interface MockDraftLiveState {
  draft: SleeperDraft | null;
  picks: SleeperDraftPick[];
  loading: boolean;
  error: string | null;
  /** When the last successful fetch landed - so the UI can show how
   * fresh the board is rather than leaving you guessing mid-draft. */
  updatedAt: Date | null;
  /** True while a fetch is in flight. */
  refreshing: boolean;
  /** Fetch right now instead of waiting out the poll interval. Cancels
   * the pending tick so a manual refresh doesn't double up with it. */
  refresh: () => void;
}

/**
 * Live-polls an arbitrary (mock) draft by ID - separate from
 * useDraftLive, which is hardcoded to this league's own real draft.
 * Polls through pre_draft too (not just once drafting starts) so a
 * draft that hasn't been started yet still picks up the moment it goes
 * live, without a manual refresh. Stops polling once the draft is
 * complete - nothing left to change.
 */
export function useMockDraftLive(draftId: string | null): MockDraftLiveState {
  const [state, setState] = useState<
    Omit<MockDraftLiveState, "refresh">
  >({
    draft: null,
    picks: [],
    loading: true,
    error: null,
    updatedAt: null,
    refreshing: false,
  });
  // Recursive setTimeout rather than setInterval: guarantees each fetch
  // fully finishes before the next one is scheduled, so a slow response
  // can't pile up overlapping requests.
  const timerRef = useRef<number | null>(null);
  // Lets the exported refresh() reach the current effect's tick without
  // re-running the effect (which would tear down and restart polling).
  const tickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!draftId) {
      setState({
        draft: null,
        picks: [],
        loading: false,
        error: null,
        updatedAt: null,
        refreshing: false,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null, refreshing: true }));

    async function tick() {
      try {
        const draft = await getDraft(draftId as string);
        const picks = await getDraftPicks(draftId as string).catch(() => []);
        if (cancelled) return;
        setState({
          draft,
          picks,
          loading: false,
          error: null,
          updatedAt: new Date(),
          refreshing: false,
        });
        if (draft.status !== "complete") {
          timerRef.current = window.setTimeout(tick, POLL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          draft: null,
          picks: [],
          loading: false,
          refreshing: false,
          error: err instanceof Error ? err.message : "Failed to load that draft. Check the ID/URL.",
        }));
        // A bad ID won't fix itself, but a transient network error might -
        // keep retrying at a slower cadence rather than giving up for good.
        timerRef.current = window.setTimeout(tick, POLL_MS * 3);
      }
    }

    tickRef.current = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setState((prev) => ({ ...prev, refreshing: true }));
      void tick();
    };

    tick();
    return () => {
      cancelled = true;
      tickRef.current = null;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [draftId]);

  const refresh = useCallback(() => {
    tickRef.current?.();
  }, []);

  return { ...state, refresh };
}

/** Accepts either a raw draft ID or a full Sleeper draft URL and pulls
 * out the numeric ID, so the input box doesn't require the user to trim
 * the URL down themselves. */
export function extractDraftId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d{10,})/);
  return match ? match[1] : null;
}
