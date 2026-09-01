import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { useDraftLive } from "../lib/useDraftLive";
import { usePlayerPool, type DraftPlayer, type FantasyPosition } from "../lib/players";
import {
  computeSnakeDraftSlots,
  picksUntilNext,
  explainScoringRules,
  explainRosterAndLeagueRules,
  computePositionalScarcity,
  computeHistoricalPlayoffLine,
} from "../lib/draftAssistant";
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

  useEffect(() => {
    setBoard(loadBoard());
  }, []);

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

  const playoffLine = useMemo(() => (history ? computeHistoricalPlayoffLine(history) : []), [history]);
  const powerRankings = useMemo(() => (history ? computeAllTimePowerRankings(history) : []), [history]);
  const sackoCounts = useMemo(() => (history ? getSackoCounts(history) : []), [history]);

  const filteredPlayers = useMemo(() => {
    let list = players;
    if (positionFilter !== "ALL") list = list.filter((p) => p.position === positionFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    // expertRank (FantasyPros) and searchRank (Sleeper) aren't on the
    // same scale - expertRank only ever runs 1-10 (the free API tier's
    // real top 10 per position), while searchRank is a much wider,
    // unrelated popularity number. Comparing them as raw numbers would
    // sometimes rank an unverified #11 above a real, expert-confirmed
    // #10. Group instead: every FantasyPros-verified player first
    // (sorted by their own real rank), then everyone else by
    // searchRank - correct regardless of position filter, since within
    // "ALL" this also means every position's real top 10 surfaces before
    // any Sleeper-only guess, without needing a cross-position blend
    // that a top-10-per-position free tier can't actually support.
    return [...list]
      .sort((a, b) => {
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
  }, [players, positionFilter, search]);

  if (historyLoading || draftLoading) return <LoadingScreen label="Loading draft data…" />;
  if (historyError || !history) return <ErrorScreen message={historyError ?? "Unknown error"} />;
  if (draftError || !league) return <ErrorScreen message={draftError ?? "Couldn't load league settings"} />;

  const weakestByPower = [...powerRankings].sort((a, b) => a.score - b.score).slice(0, 3);
  const mostShamed = sackoCounts.slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
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
