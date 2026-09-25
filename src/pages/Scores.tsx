import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { useNflState } from "../lib/useNflState";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { TeamBadge } from "../components/TeamBadge";
import { teamColor } from "../lib/teamColors";
import { ROOT_LEAGUE_ID } from "../lib/history";
import { useLiveScores, type GameState, type LiveMatchup, type LiveTeam } from "../lib/useLiveScores";
import type { Manager } from "../lib/history";

export function Scores() {
  const { data, loading, error } = useLeagueHistory();
  const { state: nflState } = useNflState();
  const currentWeek = nflState?.week ?? null;
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const week = viewWeek ?? currentWeek;

  const { matchups, loading: scoresLoading, error: scoresError, updatedAt, refreshing, weekComplete, refresh } =
    useLiveScores(ROOT_LEAGUE_ID, week);

  const managers = data?.managers ?? {};
  // Weeks worth offering: everything up to and including the current one.
  const weekOptions = useMemo(
    () => (currentWeek === null ? [] : Array.from({ length: currentWeek }, (_, i) => i + 1).reverse()),
    [currentWeek],
  );

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Scores</h1>
        <p className="mt-1 text-sm text-muted">
          Every matchup with live scoring, straight from Sleeper. Tap one for the lineups. See{" "}
          <Link to="/odds" className="font-medium text-neon hover:underline">
            Odds
          </Link>{" "}
          for what was projected before kickoff.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-primary">Week {week ?? "—"}</h2>
          <span className="text-[11px] text-muted">
            {refreshing
              ? "Checking Sleeper…"
              : weekComplete
                ? "Final"
                : updatedAt
                  ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {weekOptions.length > 0 && (
              <select
                value={week ?? ""}
                onChange={(e) => setViewWeek(Number(e.target.value))}
                className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-primary"
              >
                {weekOptions.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-body hover:bg-line disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {scoresError && (
          <p className="border-b border-line px-5 py-2 text-sm text-red-400">{scoresError}</p>
        )}

        {scoresLoading ? (
          <p className="px-5 py-4 text-sm text-muted">Loading scores…</p>
        ) : matchups.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No matchups for that week.</p>
        ) : (
          <div className="divide-y divide-line">
            {matchups.map((m) => (
              <MatchupRow key={m.matchupId} matchup={m} managers={managers} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchupRow({
  matchup,
  managers,
}: {
  matchup: LiveMatchup;
  managers: Record<string, Manager>;
}) {
  const [open, setOpen] = useState(false);
  const { a, b } = matchup;
  const managerA = a.ownerUserId ? managers[a.ownerUserId] : undefined;
  const managerB = b.ownerUserId ? managers[b.ownerUserId] : undefined;
  const colorA = a.ownerUserId ? teamColor(a.ownerUserId) : "#888";
  const colorB = b.ownerUserId ? teamColor(b.ownerUserId) : "#888";
  // Nobody "leads" a game nobody has played yet, so a 0-0 matchup gets
  // no highlight rather than an arbitrary one.
  const started = a.points > 0 || b.points > 0;
  const aLeads = started && a.points > b.points;
  const bLeads = started && b.points > a.points;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5"
      >
        <TeamSide
          manager={managerA}
          team={a}
          color={colorA}
          leading={aLeads}
        />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
          vs
        </span>
        <TeamSide
          manager={managerB}
          team={b}
          color={colorB}
          leading={bLeads}
          align="right"
        />
        <span aria-hidden className="shrink-0 text-xs text-muted">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && <Lineups a={a} b={b} colorA={colorA} colorB={colorB} />}
    </div>
  );
}

function TeamSide({
  manager,
  team,
  color,
  leading,
  align = "left",
}: {
  manager: Manager | undefined;
  team: LiveTeam;
  color: string;
  leading: boolean;
  align?: "left" | "right";
}) {
  const right = align === "right";
  return (
    <span className={`flex min-w-0 flex-1 items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
      {manager && (
        <span className="hidden shrink-0 sm:block">
          <TeamBadge userId={manager.userId} displayName={manager.displayName} size={26} />
        </span>
      )}
      <span className={`min-w-0 flex-1 ${right ? "text-right" : ""}`}>
        <span
          className={`block truncate text-sm ${leading ? "font-semibold" : "text-body"}`}
          style={leading ? { color } : undefined}
        >
          {manager?.displayName ?? `Roster ${team.rosterId}`}
        </span>
        <span className="block truncate text-[11px] text-muted">
          {team.yetToPlay > 0 ? `${team.yetToPlay} yet to play` : "all played"}
          {team.benchPoints > 0 && ` · bench ${team.benchPoints.toFixed(1)}`}
        </span>
      </span>
      <span
        className="shrink-0 text-lg font-bold tabular-nums"
        style={{ color: leading ? color : undefined }}
      >
        {team.points.toFixed(1)}
      </span>
    </span>
  );
}

/** Both lineups slot against slot, the way the matchup is actually read. */
function Lineups({
  a,
  b,
  colorA,
  colorB,
}: {
  a: LiveTeam;
  b: LiveTeam;
  colorA: string;
  colorB: string;
}) {
  const rows = a.starters.map((starter, i) => ({
    slot: starter.slot,
    a: starter,
    b: b.starters[i] ?? null,
  }));

  return (
    <div className="border-t border-line bg-surface-2/40 px-3 py-2 sm:px-5 sm:py-3">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2 py-1 text-xs">
          <PlayerCell starter={row.a} color={colorA} />
          <span className="w-11 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
            {row.slot}
          </span>
          <PlayerCell starter={row.b} color={colorB} align="right" />
        </div>
      ))}
    </div>
  );
}

/** Dimmed until the player's game has actually started, so a 0.0 that
 * hasn't happened yet doesn't read the same as a 0.0 that has. */
const STATE_STYLE: Record<GameState, string> = {
  pre: "opacity-45",
  live: "",
  final: "",
  bye: "opacity-45",
};

function PlayerCell({
  starter,
  color,
  align = "left",
}: {
  starter: LiveMatchup["a"]["starters"][number] | null;
  color: string;
  align?: "left" | "right";
}) {
  const right = align === "right";
  if (!starter || starter.name === null) {
    return (
      <span className={`min-w-0 flex-1 truncate text-amber-400/80 ${right ? "text-right" : ""}`}>
        Empty slot
      </span>
    );
  }
  return (
    <span
      className={`flex min-w-0 flex-1 items-baseline gap-1.5 ${right ? "flex-row-reverse" : ""} ${
        STATE_STYLE[starter.gameState]
      }`}
    >
      <span className={`min-w-0 flex-1 truncate text-body ${right ? "text-right" : ""}`}>
        {starter.name}
      </span>
      {starter.gameState === "live" && (
        <span
          title="Game in progress"
          aria-label="Game in progress"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
        />
      )}
      {starter.gameState === "bye" && (
        <span className="shrink-0 text-[9px] font-bold text-red-400/80">BYE</span>
      )}
      <span className="shrink-0 tabular-nums font-semibold" style={{ color }}>
        {starter.points.toFixed(1)}
      </span>
    </span>
  );
}
