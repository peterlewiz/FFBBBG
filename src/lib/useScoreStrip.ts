import { useEffect, useState } from "react";
import { getLeague, getLeagueRosters, getMatchups } from "../api/sleeper";
import { cachedSchedule } from "./useLiveScores";

/** Same cadence as the Scores page - fantasy points settle a beat behind
 * the play, so faster polling just re-reads numbers that haven't moved. */
const POLL_MS = 30_000;

/**
 * - pre: nothing has kicked off
 * - live: a game is being played right now
 * - underway: some games are done but none is on right now - the gaps
 *   between Thursday, Sunday and Monday. Without this the week reads as
 *   "upcoming" with Thursday night's points already on the board.
 * - final: every game is done
 */
export type StripStatus = "pre" | "live" | "underway" | "final";

export interface StripTeam {
  ownerUserId: string | null;
  points: number;
}

export interface StripMatchup {
  matchupId: number;
  a: StripTeam;
  b: StripTeam;
}

export interface ScoreStripState {
  matchups: StripMatchup[];
  /** Where the week as a whole is up to, from the NFL fixture list. */
  status: StripStatus | null;
}

/**
 * Team totals for the week's matchups, for the score strip in the header.
 *
 * Deliberately lighter than useLiveScores. That hook resolves every
 * starter to a name and an NFL game, which needs Sleeper's full player
 * list - a ~15MB download on a cold cache. The strip only shows totals,
 * and it's on every page, so it would have made that download the price
 * of opening the site at all. Totals, rosters (for who owns what) and the
 * cached fixture list are all it takes.
 */
export function useScoreStrip(leagueId: string, week: number | null): ScoreStripState {
  const [state, setState] = useState<ScoreStripState>({ matchups: [], status: null });

  useEffect(() => {
    if (week === null) return;
    const targetWeek = week;
    let cancelled = false;
    let timer: number | null = null;

    async function read() {
      try {
        const league = await getLeague(leagueId);
        const [rosters, rows, schedule] = await Promise.all([
          getLeagueRosters(leagueId),
          getMatchups(leagueId, targetWeek),
          cachedSchedule(league.season),
        ]);
        if (cancelled) return;

        const owner = new Map(rosters.map((r) => [r.roster_id, r.owner_id]));
        const byMatchup = new Map<number, StripTeam[]>();
        for (const row of rows) {
          if (row.matchup_id === null) continue;
          const arr = byMatchup.get(row.matchup_id) ?? [];
          arr.push({ ownerUserId: owner.get(row.roster_id) ?? null, points: row.points ?? 0 });
          byMatchup.set(row.matchup_id, arr);
        }
        const matchups = [...byMatchup.entries()]
          .filter(([, pair]) => pair.length === 2)
          .map(([matchupId, [a, b]]) => ({ matchupId, a, b }))
          .sort((x, y) => x.matchupId - y.matchupId);

        const games = schedule.filter((g) => g.week === targetWeek);
        const anyLive = games.some((g) => g.status !== "pre_game" && g.status !== "complete");
        const anyDone = games.some((g) => g.status === "complete");
        const status: StripStatus =
          games.length > 0 && games.every((g) => g.status === "complete")
            ? "final"
            : anyLive
              ? "live"
              : anyDone
                ? "underway"
                : "pre";

        setState({ matchups, status });
        // A finished week has nothing left to update.
        if (status !== "final") timer = window.setTimeout(read, POLL_MS);
      } catch {
        // Keep whatever was showing and try again - a dropped request is no
        // reason to blank the strip mid-game.
        if (!cancelled) timer = window.setTimeout(read, POLL_MS);
      }
    }

    void read();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [leagueId, week]);

  return state;
}
