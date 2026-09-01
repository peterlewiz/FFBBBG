import { useEffect, useRef, useState } from "react";
import { getDraft, getDraftPicks, getLeague } from "../api/sleeper";
import type { SleeperDraft, SleeperDraftPick, SleeperLeague } from "../api/types";
import { ROOT_LEAGUE_ID } from "./history";

const POLL_MS = 15000; // only matters once the draft is actually live

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
 * the site needs them) plus the draft itself, live-polled for picks once
 * drafting is underway so this auto-updates on draft day without a
 * manual refresh.
 */
export function useDraftLive(): DraftLiveState {
  const [state, setState] = useState<DraftLiveState>({
    league: null,
    draft: null,
    picks: [],
    loading: true,
    error: null,
  });
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOnce() {
      try {
        const league = await getLeague(ROOT_LEAGUE_ID);
        const draft = league.draft_id ? await getDraft(league.draft_id).catch(() => null) : null;
        const picks =
          draft && draft.status !== "pre_draft"
            ? await getDraftPicks(draft.draft_id).catch(() => [])
            : [];
        if (!cancelled) {
          setState({ league, draft, picks, loading: false, error: null });
        }
        // Only worth polling once the draft has actually started -
        // otherwise there's nothing new to fetch.
        if (draft && draft.status === "drafting" && pollRef.current === null) {
          pollRef.current = window.setInterval(async () => {
            const freshPicks = await getDraftPicks(draft.draft_id).catch(() => null);
            if (freshPicks && !cancelled) {
              setState((prev) => ({ ...prev, picks: freshPicks }));
            }
          }, POLL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            league: null,
            draft: null,
            picks: [],
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load draft data",
          });
        }
      }
    }

    loadOnce();
    return () => {
      cancelled = true;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, []);

  return state;
}
