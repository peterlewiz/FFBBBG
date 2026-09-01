import { useEffect, useRef, useState } from "react";
import { getDraft, getDraftPicks, getLeague } from "../api/sleeper";
import type { SleeperDraft, SleeperDraftPick, SleeperLeague } from "../api/types";
import { ROOT_LEAGUE_ID } from "./history";

const POLL_MS = 15000;

export interface DraftLiveState {
  league: SleeperLeague | null;
  draft: SleeperDraft | null;
  picks: SleeperDraftPick[];
  loading: boolean;
  error: string | null;
}

/**
 * The current season's full league settings (scoring, roster, etc. -
 * not captured in the shared LeagueHistory cache since nothing else on
 * the site needs them) plus the draft itself, live-polled for picks so
 * this auto-updates on draft day without a manual refresh.
 *
 * Polls continuously regardless of the draft's current status - not
 * just while it's literally "drafting". That check used to happen once,
 * at mount: if the page was open early (during the pre_draft countdown)
 * or the draft happened to be "paused" at that exact instant, polling
 * never started at all, and it never got a second chance to - the whole
 * point of leaving this page open in advance. Now it keeps polling
 * through pre_draft/drafting/paused and only stops once the draft is
 * actually "complete" (recursive setTimeout rather than setInterval, so
 * a slow response can't cause overlapping requests to pile up).
 */
export function useDraftLive(): DraftLiveState {
  const [state, setState] = useState<DraftLiveState>({
    league: null,
    draft: null,
    picks: [],
    loading: true,
    error: null,
  });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const league = await getLeague(ROOT_LEAGUE_ID);
        const draft = league.draft_id ? await getDraft(league.draft_id).catch(() => null) : null;
        const picks = draft ? await getDraftPicks(draft.draft_id).catch(() => []) : [];
        if (cancelled) return;
        setState({ league, draft, picks, loading: false, error: null });
        if (draft?.status !== "complete") {
          timerRef.current = window.setTimeout(tick, POLL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          league: null,
          draft: null,
          picks: [],
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load draft data",
        });
        // A transient network error shouldn't end polling for good -
        // retry at a slower cadence rather than freezing here forever.
        timerRef.current = window.setTimeout(tick, POLL_MS * 3);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return state;
}
