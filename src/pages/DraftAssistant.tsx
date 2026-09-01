import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { useDraftLive } from "../lib/useDraftLive";
import { useMockDraftLive, extractDraftId } from "../lib/useMockDraftLive";
import { usePlayerPool, type DraftPlayer, type FantasyPosition } from "../lib/players";
import {
  computeSnakeDraftSlots,
  picksUntilNext,
  explainScoringRules,
  explainRosterAndLeagueRules,
  computePositionalScarcity,
  computeHistoricalPlayoffLine,
} from "../lib/draftAssistant";
import { computePickSuggestions, livePicksUntilNext, slotForOverallPick, type PickSuggestion } from "../lib/mockDraftSuggestions";
import { rosterRequirementsFromLeague, rankByVbd } from "../lib/valueBasedRanking";
import { computeAllTimePowerRankings } from "../lib/powerRankings";
import { getSackoCounts } from "../lib/sacko";
import { LoadingScreen, ErrorScreen } from "../components/StatusScreen";
import { Countdown } from "../components/Countdown";
import { resolveDraftDate } from "../lib/constants";
import { teamColor } from "../lib/teamColors";
import { TeamBadge } from "../components/TeamBadge";

const PLEWIZ_USER_ID = "738510505450283008";
const POSITIONS: FantasyPosition[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
const BOARD_STORAGE_KEY = "draft-assistant:board:v1";
// Bumped alongside DEFAULT_MOCK_DRAFT_ID: a previously-saved (now
// finished/abandoned) mock's ID would otherwise win over the new
// default forever, since the saved value is read on mount. Bumping the
// key retires the old saved value so a fresh mock opens straight away;
// pasting any other draft ID into the box still overrides and persists.
const MOCK_DRAFT_STORAGE_KEY = "draft-assistant:mock-draft-id:v2";
const DEFAULT_MOCK_DRAFT_ID = "1400534735561756672";

type BoardMark = "mine" | "gone";

function loadBoard(): Record<string, BoardMark> {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBoard(board: Record<string, BoardMark>) {
  try {
    localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(board));
  } catch {
    // ignore - board just won't persist across reloads
  }
}

function RuleList({ facts }: { facts: { label: string; detail: string }[] }) {
  return (
    <dl className="divide-y divide-line">
      {facts.map((f) => (
        <div key={f.label} className="px-5 py-3">
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{f.label}</dt>
          <dd className="mt-0.5 text-sm text-body">{f.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DraftAssistant() {
  const { data: history, loading: historyLoading, error: historyError } = useLeagueHistory();
  const { league, draft, picks, loading: draftLoading, error: draftError } = useDraftLive();
  const {
    players,
    loading: playersLoading,
    error: playersError,
    expertRankingsAvailable,
    expertRankingsStale,
    expertRankingsFullDepth,
  } = usePlayerPool();

  const [board, setBoard] = useState<Record<string, BoardMark>>({});
  const [positionFilter, setPositionFilter] = useState<FantasyPosition | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [mockDraftInput, setMockDraftInput] = useState(DEFAULT_MOCK_DRAFT_ID);
  const [mockDraftId, setMockDraftId] = useState<string | null>(DEFAULT_MOCK_DRAFT_ID);

  useEffect(() => {
    setBoard(loadBoard());
    try {
      const saved = localStorage.getItem(MOCK_DRAFT_STORAGE_KEY);
      if (saved) {
        setMockDraftInput(saved);
        setMockDraftId(saved);
      }
    } catch {
      // ignore - just falls back to the default mock draft ID
    }
  }, []);

  function loadMockDraft(raw: string) {
    const id = extractDraftId(raw);
    setMockDraftId(id);
    if (id) {
      try {
        localStorage.setItem(MOCK_DRAFT_STORAGE_KEY, id);
      } catch {
        // ignore - just won't persist across reloads
      }
    }
  }

  const {
    draft: mockDraft,
    picks: mockPicks,
    loading: mockLoading,
    error: mockError,
  } = useMockDraftLive(mockDraftId);

  function cycleMark(playerId: string) {
    setBoard((prev) => {
      const current = prev[playerId];
      const next = { ...prev };
      if (!current) next[playerId] = "gone";
      else if (current === "gone") next[playerId] = "mine";
      else delete next[playerId];
      saveBoard(next);
      return next;
    });
  }

  // Real picks (once the draft is live) override any manual marking for
  // that player - live truth wins over pre-draft planning notes.
  const livePicks = useMemo(() => {
    const map = new Map<string, { mine: boolean; managerName: string | null }>();
    if (!history) return map;
    const rosterToUser = new Map<number, string>();
    for (const season of history.seasons) {
      for (const r of season.rosters) if (r.ownerUserId) rosterToUser.set(r.rosterId, r.ownerUserId);
    }
    for (const pick of picks) {
      const userId = pick.picked_by || rosterToUser.get(pick.roster_id);
      map.set(pick.player_id, {
        mine: userId === PLEWIZ_USER_ID,
        managerName: userId ? (history.managers[userId]?.displayName ?? null) : null,
      });
    }
    return map;
  }, [picks, history]);

  const myDraftSlots = useMemo(() => {
    if (!league) return [];
    const pickSlot = draft?.draft_order?.[PLEWIZ_USER_ID];
    const teams = league.settings?.num_teams ?? 12;
    const rounds = draft?.settings?.rounds ?? 14;
    if (!pickSlot) return [];
    return computeSnakeDraftSlots(pickSlot, teams, rounds);
  }, [league, draft]);

  const scoringFacts = useMemo(() => (league ? explainScoringRules(league) : []), [league]);
  const rosterFacts = useMemo(() => (league ? explainRosterAndLeagueRules(league) : []), [league]);
  const scarcity = useMemo(
    () => (league && players.length > 0 ? computePositionalScarcity(league, players) : []),
    [league, players],
  );
  // Real "value over consensus": projectedRank (FantasyPros' own point
  // projections, ranked within position) vs expertRank (their expert
  // consensus rank, same position). Positive gap = the raw numbers like
  // this player more than the market does - a sleeper. Negative = priced
  // above what the projection itself expects - a fade. Both sides come
  // from the same source, at the same depth, so this is a real
  // comparison, not a proxy.
  const sleepersAndFades = useMemo(() => {
    const withGap = players.filter(
      (p) => p.valueGap !== null && (p.position === "QB" || p.position === "RB" || p.position === "WR" || p.position === "TE"),
    );
    const sleepers = [...withGap].sort((a, b) => b.valueGap! - a.valueGap!).slice(0, 10);
    const fades = [...withGap].sort((a, b) => a.valueGap! - b.valueGap!).slice(0, 10);
    return { sleepers, fades };
  }, [players]);
  // The "edge over the room" signal, separate from the value-gap above.
  // valueGap compares FantasyPros against itself; this compares Sleeper's
  // own popularity-based ranking against real expert consensus - the
  // ranking other drafters relying on Sleeper's built-in board (not paid
  // expert data) will actually be working off of. Expert consensus is
  // treated as the ground truth throughout this page; this section exists
  // specifically to flag where *that ground truth* diverges from what the
  // rest of the room is likely to see.
  const marketEdges = useMemo(() => {
    const withGap = players.filter(
      (p) => p.marketGap !== null && (p.position === "QB" || p.position === "RB" || p.position === "WR" || p.position === "TE"),
    );
    // Positive: Sleeper's default ranks them worse than real experts do -
    // the field passes on them longer than they should, so they're likely
    // to fall to you at a discount.
    const willFall = [...withGap].sort((a, b) => b.marketGap! - a.marketGap!).slice(0, 10);
    // Negative: Sleeper's own popularity has them ranked better than real
    // experts do - the field reaches for them early, so expect them gone
    // sooner than expert analysis alone would suggest.
    const willGoEarly = [...withGap].sort((a, b) => a.marketGap! - b.marketGap!).slice(0, 10);
    return { willFall, willGoEarly };
  }, [players]);

  // Live mock draft: separate draft_id from the real league's draft
  // (useDraftLive above), polled independently via useMockDraftLive.
  const mockDraftInfo = useMemo(() => {
    if (!mockDraft) return null;
    const teams = mockDraft.settings?.teams ?? 12;
    const rounds = mockDraft.settings?.rounds ?? 14;
    const mySlot = mockDraft.draft_order?.[PLEWIZ_USER_ID] ?? null;
    if (!mySlot) return null;
    const myOverallPicks = computeSnakeDraftSlots(mySlot, teams, rounds).map((s) => s.overall);
    const myRosterId = mockDraft.slot_to_roster_id?.[String(mySlot)] ?? null;
    const draftedPlayerIds = new Set(mockPicks.map((p) => p.player_id));
    const myPlayerIds = new Set(
      mockPicks.filter((p) => p.roster_id === myRosterId).map((p) => p.player_id),
    );
    const nextOverall = mockPicks.length + 1;
    const onTheClockSlot = slotForOverallPick(nextOverall, teams);
    const currentRound = Math.ceil(nextOverall / teams);
    const picksUntilMyNext = livePicksUntilNext(myOverallPicks, mockPicks.length);
    const myDraftedPlayers = players.filter((p) => myPlayerIds.has(p.id));

    let suggestions: PickSuggestion[] = [];
    if (players.length > 0 && mockDraft.status !== "complete") {
      suggestions = computePickSuggestions({
        players,
        draftedPlayerIds,
        myPlayerIds,
        draftSettings: mockDraft.settings,
        currentRound,
        picksUntilNext: picksUntilMyNext,
      });
    }

    return {
      mySlot,
      teams,
      rounds,
      onTheClockSlot,
      isMyTurn: onTheClockSlot === mySlot && nextOverall <= teams * rounds,
      currentRound,
      picksUntilMyNext,
      myDraftedPlayers,
      suggestions,
      done: mockPicks.length >= teams * rounds,
    };
  }, [mockDraft, mockPicks, players]);

  const playoffLine = useMemo(() => (history ? computeHistoricalPlayoffLine(history) : []), [history]);
  const powerRankings = useMemo(() => (history ? computeAllTimePowerRankings(history) : []), [history]);
  const sackoCounts = useMemo(() => (history ? getSackoCounts(history) : []), [history]);

  // Cross-position ranking (see valueBasedRanking.ts) for the "ALL"
  // filter and the Overall Big Board table below. This replaced a bug:
  // the old "ALL" sort compared raw expertRank across positions, but
  // that number is position-relative (RB1/WR1/QB1/TE1 are all literally
  // "1"), so it just interleaved every position's #1s, then #2s, etc. -
  // not a real "best overall" order. VBD (points over that position's
  // own replacement level, from this league's actual roster settings)
  // is the number that's actually comparable across positions.
  const vbdRanked = useMemo(
    () => (league && players.length > 0 ? rankByVbd(players, rosterRequirementsFromLeague(league)) : []),
    [league, players],
  );
  const vbdById = useMemo(() => new Map(vbdRanked.map((p) => [p.id, p.vbd])), [vbdRanked]);
  const sleeperOverallOrder = useMemo(() => {
    const sorted = [...players].sort((a, b) => a.searchRank - b.searchRank);
    return new Map(sorted.map((p, i) => [p.id, i + 1]));
  }, [players]);

  const filteredPlayers = useMemo(() => {
    let list = players;
    if (positionFilter !== "ALL") list = list.filter((p) => p.position === positionFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return [...list]
      .sort((a, b) => {
        if (positionFilter === "ALL") {
          const aVbd = vbdById.get(a.id) ?? null;
          const bVbd = vbdById.get(b.id) ?? null;
          if (aVbd != null && bVbd != null) return bVbd - aVbd;
          if (aVbd != null) return -1;
          if (bVbd != null) return 1;
          return a.searchRank - b.searchRank;
        }
        // Within a single position, expertRank IS directly comparable
        // (it's that position's own real rank) - real consensus first,
        // Sleeper's relevance number as a fallback for anyone unmatched.
        // `!= null` (loose) catches both null and a merely-absent field
        // (undefined) the same way - a stale cached player object from
        // before this field existed is `undefined`, not `null`, and a
        // strict `!==` check let that silently corrupt this sort (see
        // players.ts's CACHE_KEY comment for the full story).
        const aHasExpert = a.expertRank != null;
        const bHasExpert = b.expertRank != null;
        if (aHasExpert !== bHasExpert) return aHasExpert ? -1 : 1;
        if (aHasExpert && bHasExpert) return a.expertRank! - b.expertRank!;
        return a.searchRank - b.searchRank;
      })
      .slice(0, 150);
  }, [players, positionFilter, search, vbdById]);

  if (historyLoading || draftLoading) return <LoadingScreen label="Loading draft data…" />;
  if (historyError || !history) return <ErrorScreen message={historyError ?? "Unknown error"} />;
  if (draftError || !league) return <ErrorScreen message={draftError ?? "Couldn't load league settings"} />;

  const weakestByPower = [...powerRankings].sort((a, b) => a.score - b.score).slice(0, 3);
  const mostShamed = sackoCounts.slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      {/* Live mock draft: separate draft_id, polled every ~4s. Suggestion
       * engine blends cross-position value-over-replacement, positional
       * need against this draft's own roster settings, and a survival
       * probability modeled off Sleeper's own search_rank ordering (what
       * the CPU-filled room is actually drafting off of), against how
       * many picks stand between now and your next turn. Kept first on
       * the page - it's the thing to check first on every single pick. */}
      <div className="overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-fuchsia-400">🔴 Live Mock Draft</h2>
          <p className="text-xs text-muted">Paste a Sleeper mock draft URL or ID to get live pick suggestions</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <input
            value={mockDraftInput}
            onChange={(e) => setMockDraftInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadMockDraft(mockDraftInput)}
            placeholder="sleeper.com/draft/nfl/…"
            className="min-w-64 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary"
          />
          <button
            onClick={() => loadMockDraft(mockDraftInput)}
            className="rounded-lg bg-fuchsia-500/20 px-3 py-1.5 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-500/30"
          >
            Load
          </button>
        </div>
        <div className="p-5">
          {!mockDraftId ? (
            <p className="text-sm text-muted">Paste a mock draft URL or ID above to connect.</p>
          ) : mockLoading && !mockDraft ? (
            <p className="text-sm text-muted">Connecting to draft {mockDraftId}…</p>
          ) : mockError ? (
            <p className="text-sm text-red-400">{mockError}</p>
          ) : !mockDraft || !mockDraftInfo ? (
            <p className="text-sm text-amber-400">
              Connected, but couldn't find your pick slot in this draft's draft_order - make sure you've
              joined it (not just spectating) with this Sleeper account.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    mockDraft.status === "drafting" || (mockDraft.status === "paused" && mockDraftInfo.isMyTurn)
                      ? "bg-emerald-500/20 text-emerald-400"
                      : mockDraft.status === "complete"
                        ? "bg-line text-muted"
                        : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {/* Sleeper mock drafts vs. bots auto-pick every CPU seat
                   * instantly and "paused" is the normal resting state
                   * while it's waiting on you specifically - it isn't an
                   * error or a stalled draft, so it shouldn't read as one. */}
                  {mockDraft.status === "paused"
                    ? mockDraftInfo.isMyTurn
                      ? "waiting on you"
                      : "paused"
                    : mockDraft.status.replace(/_/g, " ")}
                </span>
                {!mockDraftInfo.done && (
                  <span className="text-sm text-body">
                    Round {mockDraftInfo.currentRound}/{mockDraftInfo.rounds} · Slot{" "}
                    {mockDraftInfo.onTheClockSlot} on the clock
                  </span>
                )}
                {mockDraftInfo.isMyTurn && (
                  <span className="animate-pulse rounded-full bg-neon px-3 py-1 text-xs font-bold text-ink">
                    YOUR TURN
                  </span>
                )}
                {!mockDraftInfo.done && !mockDraftInfo.isMyTurn && (
                  <span className="text-xs text-muted">
                    {mockDraftInfo.picksUntilMyNext} pick{mockDraftInfo.picksUntilMyNext === 1 ? "" : "s"} until
                    your turn
                  </span>
                )}
              </div>

              {mockDraftInfo.done ? (
                <p className="text-sm text-muted">Draft complete.</p>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                    Suggestions for your pick
                  </p>
                  {mockDraftInfo.suggestions.length === 0 ? (
                    <p className="text-sm text-muted">
                      {playersLoading ? "Loading player pool…" : "No candidates - waiting on player/expert data."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {mockDraftInfo.suggestions.map((s, i) => (
                        <div key={s.player.id} className="rounded-xl border border-line bg-surface-2 p-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-500/20 text-[10px] font-bold text-fuchsia-300">
                              {i + 1}
                            </span>
                            <span className="font-semibold text-primary">{s.player.name}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {s.player.position} · {s.player.posRank} · {s.player.team ?? "FA"}
                          </p>
                          <ul className="mt-2 space-y-1 text-xs text-body">
                            {s.reasons.map((r, ri) => (
                              <li key={ri}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {mockDraftInfo.myDraftedPlayers.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Your roster so far</p>
                  <div className="flex flex-wrap gap-2">
                    {mockDraftInfo.myDraftedPlayers.map((p) => (
                      <span
                        key={p.id}
                        className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-body"
                      >
                        {p.position} {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Player board */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-primary">Player Board</h2>
          <p className="text-xs text-muted">
            {expertRankingsAvailable ? (
              <>
                QB/RB/WR/TE ranked by FantasyPros' half-PPR expert consensus (shown as a
                highlighted rank, e.g. "RB4"){" "}
                {expertRankingsStale && <span className="text-amber-400">(showing a cached, slightly stale copy)</span>}
                {!expertRankingsFullDepth && " - free tier: only each position's top 10 is real consensus, rest falls back to Sleeper's relevance ranking"}
                . K/DEF use Sleeper's relevance ranking.
              </>
            ) : (
              "Ranked by Sleeper's own relevance ranking (FantasyPros data unavailable right now)."
            )}{" "}
            Click a player to mark drafted/mine; live picks override this once the draft starts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {(["ALL", ...POSITIONS] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setPositionFilter(pos)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                positionFilter === pos ? "bg-neon text-ink" : "bg-surface-2 text-body hover:bg-line"
              }`}
            >
              {pos}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name…"
            className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary"
          />
        </div>
        {playersLoading ? (
          <p className="px-5 py-6 text-sm text-muted">Loading player pool (~15MB, cached for a day)…</p>
        ) : playersError ? (
          <p className="px-5 py-6 text-sm text-red-400">{playersError}</p>
        ) : (
          <ul className="max-h-[36rem] divide-y divide-line overflow-y-auto">
            {filteredPlayers.map((p) => {
              const live = livePicks.get(p.id);
              const manual = board[p.id];
              const state: "available" | "gone" | "mine" = live
                ? live.mine
                  ? "mine"
                  : "gone"
                : manual === "mine"
                  ? "mine"
                  : manual === "gone"
                    ? "gone"
                    : "available";
              return (
                <PlayerRow
                  key={p.id}
                  player={p}
                  state={state}
                  liveManagerName={live?.managerName ?? null}
                  onClick={() => !live && cycleMark(p.id)}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-300">
        Private draft-prep page for plewiz. Not linked anywhere on the site - bookmark the URL.
      </div>

      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Draft Assistant</h1>
        <p className="mt-1 text-sm text-muted">
          {league.name} · {league.season} · picking from slot{" "}
          {draft?.draft_order?.[PLEWIZ_USER_ID] ?? "?"} of {league.settings?.num_teams ?? "?"}
          {draft?.status && draft.status !== "pre_draft" && (
            <span className="ml-2 rounded-full bg-neon/10 px-2 py-0.5 text-xs font-semibold text-neon">
              Draft {draft.status}
            </span>
          )}
        </p>
      </div>

      {draft?.status === "pre_draft" && (
        <Countdown target={resolveDraftDate(draft.start_time)} label="Draft Day" />
      )}

      {/* Your draft slots */}
      {myDraftSlots.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">Your Picks (Snake Draft)</h2>
            <p className="text-xs text-muted">
              Overall pick number for each round, and how many other picks happen before your
              next turn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            {myDraftSlots.map((slot) => {
              const gap = picksUntilNext(myDraftSlots, slot.round);
              const madeThisPick = picks.some((p) => p.pick_no === slot.overall);
              return (
                <div
                  key={slot.round}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2 ${
                    madeThisPick ? "border-line bg-surface-2 opacity-50" : "border-neon/40 bg-neon/5"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    Rd {slot.round}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-primary">
                    #{slot.overall}
                  </span>
                  {gap !== null && <span className="text-[10px] text-muted">{gap} picks to next</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overall Big Board: a genuine cross-position ranking via VBD
       * (points over that position's replacement level, computed from
       * this league's actual roster settings) - not the same as either
       * Sleeper's own order or FantasyPros' expert order on their own,
       * see the explanatory text below the table. */}
      {vbdRanked.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">🏆 Overall Big Board</h2>
            <p className="text-xs text-muted">
              One cross-position ranking, by value over replacement (VBD) - not the same as
              Sleeper's order or FantasyPros' expert order on their own. See "How this differs" below.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2">Rank</th>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2">Pos</th>
                  <th className="px-4 py-2">Expert Pos Rank</th>
                  <th className="px-4 py-2 text-right">VBD (pts)</th>
                  <th className="px-4 py-2 text-right">Sleeper Overall #</th>
                  <th className="px-4 py-2 text-right">Δ vs. Sleeper</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {vbdRanked
                  .filter((p) => p.vbd !== null)
                  .slice(0, 50)
                  .map((p, i) => {
                    const sleeperOverall = sleeperOverallOrder.get(p.id) ?? null;
                    const delta = sleeperOverall !== null ? sleeperOverall - (i + 1) : null;
                    return (
                      <tr key={p.id} className="hover:bg-surface-2">
                        <td className="px-4 py-2 font-bold tabular-nums text-primary">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-primary">{p.name}</td>
                        <td className="px-4 py-2 text-muted">{p.position}</td>
                        <td className="px-4 py-2 text-muted">{p.posRank ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-body">{p.vbd!.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted">{sleeperOverall ?? "—"}</td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums font-semibold ${
                            delta === null ? "text-muted" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted"
                          }`}
                        >
                          {delta === null ? "—" : delta > 0 ? `+${delta}` : delta}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-4 text-xs text-muted">
            <p className="mb-1 font-bold uppercase tracking-wide text-body">How this differs from Sleeper and from raw expert rank</p>
            <p className="mb-1">
              <strong className="text-body">Sleeper's own order</strong> (search_rank) is a single
              cross-position popularity/relevance number, but it's not tuned to this league's
              scoring or roster construction, and leans on name recognition as much as current
              projected value.
            </p>
            <p className="mb-1">
              <strong className="text-body">FantasyPros' expert rank</strong> (posRank/expertRank
              used everywhere else on this page) is real, but only ever ranks players{" "}
              <em>within their own position</em> - RB1, WR1, QB1, and TE1 are all literally rank
              "1", so directly comparing that number across positions (which the Player Board used
              to do on "ALL") isn't a real overall order at all.
            </p>
            <p>
              <strong className="text-body">This board</strong> uses Value-Based Drafting: each
              player's FantasyPros-projected points minus the points a freely available
              replacement at the same position would score, given this league's actual starter and
              FLEX slots - the standard way analysts build one real cross-position board. It's why
              elite RBs can outrank a similarly-projected WR or QB: replacement-level RB production
              craters faster than replacement-level WR/QB production does, so the same raw point
              total is worth more at RB. "Δ vs. Sleeper" is positive when this board has a player
              higher than Sleeper's own popularity ranking does (the room may be sleeping on them),
              negative when Sleeper rates them higher (the room may reach for them).
            </p>
          </div>
        </div>
      )}

      {/* Sleepers & fades: FantasyPros' own projected points, ranked
       * within position, compared against their own expert consensus
       * rank for the same position - a real value-over-consensus signal,
       * not a proxy heuristic. */}
      {(sleepersAndFades.sleepers.length > 0 || sleepersAndFades.fades.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-surface">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-lg font-semibold text-emerald-400">🔥 Sleepers</h2>
              <p className="text-xs text-muted">
                The point projection ranks these players better than the experts do
              </p>
            </div>
            <ul className="divide-y divide-line">
              {sleepersAndFades.sleepers.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{p.position}</span>
                  <span className="flex-1 truncate font-medium text-primary">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {p.posRank} proj. #{p.projectedRank}
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-bold text-emerald-400">
                    +{p.valueGap}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-red-500/30 bg-surface">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-lg font-semibold text-red-400">⚠️ Fades</h2>
              <p className="text-xs text-muted">
                Priced above what the point projection itself expects for them
              </p>
            </div>
            <ul className="divide-y divide-line">
              {sleepersAndFades.fades.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{p.position}</span>
                  <span className="flex-1 truncate font-medium text-primary">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {p.posRank} proj. #{p.projectedRank}
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-bold text-red-400">
                    {p.valueGap}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Draft room edge: expert consensus (ground truth) vs. Sleeper's
       * own popularity-based ranking, which is what opponents relying on
       * Sleeper's built-in board (not paid expert data) will actually be
       * drafting off of. Distinct from Sleepers & Fades above, which
       * compares FantasyPros against itself. */}
      {(marketEdges.willFall.length > 0 || marketEdges.willGoEarly.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-sky-500/30 bg-surface">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-lg font-semibold text-sky-400">🎯 Will Fall To You</h2>
              <p className="text-xs text-muted">
                Sleeper's own ranking has these lower than real experts do - the room will likely
                pass on them longer than it should
              </p>
            </div>
            <ul className="divide-y divide-line">
              {marketEdges.willFall.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{p.position}</span>
                  <span className="flex-1 truncate font-medium text-primary">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    experts {p.posRank} · sleeper {p.position}#{p.sleeperPositionRank}
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-bold text-sky-400">
                    +{p.marketGap}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-orange-500/30 bg-surface">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-lg font-semibold text-orange-400">🏃 Will Go Early</h2>
              <p className="text-xs text-muted">
                Sleeper's own popularity has these higher than real experts do - expect the room to
                reach for them sooner than the numbers justify
              </p>
            </div>
            <ul className="divide-y divide-line">
              {marketEdges.willGoEarly.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">{p.position}</span>
                  <span className="flex-1 truncate font-medium text-primary">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    experts {p.posRank} · sleeper {p.position}#{p.sleeperPositionRank}
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-bold text-orange-400">
                    {p.marketGap}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* League rules */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">Scoring Rules</h2>
            <p className="text-xs text-muted">Pulled live from this league's actual settings</p>
          </div>
          <RuleList facts={scoringFacts} />
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">Roster &amp; League Rules</h2>
          </div>
          <RuleList facts={rosterFacts} />
        </div>
      </div>

      {/* Positional scarcity - skill positions only. K/DEF are excluded
       * from the ranking on purpose: this ratio would rank them as
       * "scarce" purely because they only have 1 slot each, but there's
       * no real weekly skill gap at either position, so that would be
       * actively bad advice if left in the same list. */}
      {scarcity.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">Positional Scarcity</h2>
            <p className="text-xs text-muted">
              League-wide starting demand vs. realistic startable depth - higher ratio means that
              position runs out faster. K/DEF excluded - stream/draft those last regardless of
              ratio, there's no real weekly skill gap at either.
            </p>
          </div>
          <div className="divide-y divide-line">
            {scarcity
              .filter((row) => row.position !== "K" && row.position !== "DEF")
              .map((row, i, arr) => (
                <div key={row.position} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-5 text-center text-sm text-muted">{i + 1}</span>
                  <span className="w-10 font-bold text-primary">{row.position}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-neon"
                      style={{ width: `${Math.min(100, (row.ratio / arr[0].ratio) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-muted">
                    {row.demand} slots / {row.startablePool} deep
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* League vulnerabilities */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-primary">League Vulnerabilities</h2>
          <p className="text-xs text-muted">Real patterns from this league's own history</p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              Points it took to make playoffs
            </p>
            <ul className="space-y-1 text-sm text-body">
              {playoffLine.map((y) => (
                <li key={y.season} className="flex justify-between">
                  <span className="text-muted">{y.season}</span>
                  <span className="tabular-nums">{y.cutoffPoints.toFixed(0)} pts</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                Weakest all-time power scores
              </p>
              <ul className="space-y-1 text-sm">
                {weakestByPower.map((e) => (
                  <li key={e.manager.userId} className="flex items-center gap-2">
                    <TeamBadge userId={e.manager.userId} displayName={e.manager.displayName} size={18} />
                    <Link to={`/manager/${e.manager.userId}`} className="hover:underline" style={{ color: teamColor(e.manager.userId) }}>
                      {e.manager.displayName}
                    </Link>
                    <span className="ml-auto text-xs text-muted">{e.score.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                Most last-place finishes
              </p>
              <ul className="space-y-1 text-sm">
                {mostShamed.map((e) => (
                  <li key={e.manager.userId} className="flex items-center gap-2">
                    <TeamBadge userId={e.manager.userId} displayName={e.manager.displayName} size={18} />
                    <Link to={`/manager/${e.manager.userId}`} className="hover:underline" style={{ color: teamColor(e.manager.userId) }}>
                      {e.manager.displayName}
                    </Link>
                    <span className="ml-auto text-xs text-muted">{e.count}×</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function PlayerRow({
  player,
  state,
  liveManagerName,
  onClick,
}: {
  player: DraftPlayer;
  state: "available" | "gone" | "mine";
  liveManagerName: string | null;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors ${
          state === "gone"
            ? "opacity-40"
            : state === "mine"
              ? "bg-neon/10"
              : "hover:bg-surface-2"
        }`}
      >
        <span className="w-8 shrink-0 text-center text-xs font-bold text-muted">
          {player.position}
        </span>
        {player.posRank != null && (
          <span
            className="w-10 shrink-0 text-xs font-bold tabular-nums text-neon"
            title="FantasyPros half-PPR expert consensus rank"
          >
            {player.posRank}
          </span>
        )}
        <span className={`flex-1 truncate font-medium ${state === "gone" ? "line-through" : "text-primary"}`}>
          {player.name}
        </span>
        {player.valueGap !== null && Math.abs(player.valueGap) >= 5 && (
          <span
            className="shrink-0 text-sm"
            title={
              player.valueGap > 0
                ? `Projection ranks them ${player.valueGap} spots better than consensus`
                : `Projection ranks them ${Math.abs(player.valueGap)} spots worse than consensus`
            }
          >
            {player.valueGap > 0 ? "🔥" : "⚠️"}
          </span>
        )}
        {player.marketGap !== null && Math.abs(player.marketGap) >= 15 && (
          <span
            className="shrink-0 text-sm"
            title={
              player.marketGap > 0
                ? `Sleeper's own ranking has them ${player.marketGap} spots worse than real experts - likely to fall further than it should`
                : `Sleeper's own ranking has them ${Math.abs(player.marketGap)} spots better than real experts - the room will likely reach early`
            }
          >
            {player.marketGap > 0 ? "🎯" : "🏃"}
          </span>
        )}
        {player.byeWeek != null && (
          <span className="w-8 shrink-0 text-center text-[10px] text-muted" title="Bye week">
            BYE {player.byeWeek}
          </span>
        )}
        <span className="w-10 shrink-0 text-xs text-muted">{player.team ?? "FA"}</span>
        {player.injuryStatus && (
          <span className="shrink-0 text-[10px] font-semibold uppercase text-amber-400">
            {player.injuryStatus}
          </span>
        )}
        {state === "mine" && (
          <span className="shrink-0 text-xs font-bold text-neon">
            {liveManagerName ? `Drafted by ${liveManagerName}` : "Mine"}
          </span>
        )}
        {state === "gone" && liveManagerName && (
          <span className="shrink-0 text-xs text-muted">{liveManagerName}</span>
        )}
      </button>
    </li>
  );
}
