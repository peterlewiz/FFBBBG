import { useMemo } from "react";
import { Link } from "react-router-dom";
import { usePlayoffOdds } from "../lib/usePlayoffOdds";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { TeamBadge } from "../components/TeamBadge";
import { teamColor } from "../lib/teamColors";
import type { LeagueHistory } from "../lib/history";
import type { PlayoffOddsEntry } from "../lib/playoffOdds";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Compact stacked bar: one segment per seed (dimmer for a worse seed),
 * with the "miss the playoffs" remainder left transparent. */
function SeedBar({ entry, color }: { entry: PlayoffOddsEntry; color: string }) {
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2"
      title={entry.seedPct
        .map((p, i) => (p > 0.005 ? `Seed ${i + 1}: ${pct(p)}` : null))
        .filter(Boolean)
        .join(" · ")}
    >
      {entry.seedPct.map(
        (p, i) =>
          p > 0.001 && (
            <div key={i} style={{ width: `${p * 100}%`, background: color, opacity: 1 - i * 0.09 }} />
          ),
      )}
    </div>
  );
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-muted">new</span>;
  }
  const pts = Math.round(value * 100);
  if (pts === 0) return <span className="text-xs text-muted">—</span>;
  const up = pts > 0;
  return (
    <span
      className={`text-xs font-bold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(pts)}%
    </span>
  );
}

/** The odds table, shared by the real in-season view and the preseason
 * projection - `delta` is omitted entirely for the latter, since there's
 * no "last week" to compare a hypothetical projection against. */
function OddsTable({
  history,
  entries,
  delta,
}: {
  history: LeagueHistory;
  entries: PlayoffOddsEntry[];
  delta?: { previousWeek: number | null; values: Record<string, number | null> };
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-3 font-medium sm:px-4">#</th>
            <th className="px-3 py-3 font-medium sm:px-4">Manager</th>
            <th className="px-3 py-3 font-medium sm:px-4">Playoff odds</th>
            <th className="px-3 py-3 font-medium sm:px-4">Seed</th>
            <th className="px-3 py-3 font-medium sm:px-4">Title odds</th>
            {delta && (
              <th className="px-3 py-3 font-medium sm:px-4">
                Δ{delta.previousWeek !== null ? ` wk ${delta.previousWeek}` : ""}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {entries.map((entry, i) => {
            const manager = history.managers[entry.userId];
            if (!manager) return null;
            const color = teamColor(entry.userId);
            return (
              <tr key={entry.userId}>
                <td className="whitespace-nowrap px-3 py-3 text-muted sm:px-4">{i + 1}</td>
                <td className="px-3 py-3 sm:px-4">
                  <div className="flex items-center gap-2">
                    <TeamBadge userId={manager.userId} displayName={manager.displayName} size={22} />
                    <Link
                      to={`/manager/${manager.userId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {manager.displayName}
                    </Link>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                  <span className="font-bold tabular-nums" style={{ color }}>
                    {pct(entry.playoffPct)}
                  </span>
                </td>
                <td className="px-3 py-3 sm:px-4">
                  <SeedBar entry={entry} color={color} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-body sm:px-4">
                  {pct(entry.titlePct)}
                </td>
                {delta && (
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                    <DeltaBadge value={delta.values[entry.userId] ?? null} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PlayoffOdds() {
  const { data: history } = useLeagueHistory();
  const { data, preseasonData, previousWeek, deltas, loading, error } = usePlayoffOdds();

  // The single biggest week-over-week mover, for the headline callout -
  // this is the "you dropped 14% after Sunday" moment.
  const biggestMover = useMemo(() => {
    if (!data) return null;
    let best: { userId: string; delta: number } | null = null;
    for (const entry of data.entries) {
      const d = deltas[entry.userId]?.playoffDelta;
      if (d === null || d === undefined) continue;
      if (!best || Math.abs(d) > Math.abs(best.delta)) best = { userId: entry.userId, delta: d };
    }
    return best;
  }, [data, deltas]);

  if (loading) return <LoadingScreen />;
  if (error || !history) return <ErrorScreen message={error ?? "Unknown error"} />;

  const latestSeason = history.seasons[history.seasons.length - 1];
  const noScheduleYet = !data && !preseasonData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Playoff Odds</h1>
        <p className="mt-1 text-sm text-muted">
          {data
            ? `${data.simulations.toLocaleString()} simulated seasons, run off live Elo ratings - through week ${data.asOfWeek || "0 (preseason)"}.`
            : preseasonData
              ? `${preseasonData.simulations.toLocaleString()} simulated seasons, run off career Elo ratings.`
              : "Monte Carlo playoff odds, run off live Elo ratings."}
        </p>
      </div>

      {noScheduleYet && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          {latestSeason?.rosters.length
            ? "Not enough managers signed up yet to project a playoff field."
            : "The season hasn't started yet - odds will show once the draft happens and the schedule is set."}
        </div>
      )}

      {preseasonData && (
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
          There&apos;s no schedule yet, so this is a <span className="text-primary">preseason
          projection</span>: this year&apos;s managers ranked purely by career Elo (built from
          every previous season) playing a hypothetical round-robin. It&apos;ll switch to real,
          schedule-based odds automatically once the season starts.
        </div>
      )}

      {data && biggestMover && (
        <div className="rounded-2xl border border-line bg-surface px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            Biggest mover{previousWeek !== null ? ` since week ${previousWeek}` : ""}
          </p>
          <p className="mt-1 text-lg font-semibold text-primary">
            <Link
              to={`/manager/${biggestMover.userId}`}
              className="hover:underline"
              style={{ color: teamColor(biggestMover.userId) }}
            >
              {history.managers[biggestMover.userId]?.displayName ?? "Unknown"}
            </Link>{" "}
            {biggestMover.delta > 0 ? "gained" : "dropped"}{" "}
            <span className={biggestMover.delta > 0 ? "text-emerald-400" : "text-red-400"}>
              {Math.abs(Math.round(biggestMover.delta * 100))}%
            </span>{" "}
            to make the playoffs
          </p>
        </div>
      )}

      {data && (
        <OddsTable
          history={history}
          entries={data.entries}
          delta={{
            previousWeek,
            values: Object.fromEntries(
              Object.entries(deltas).map(([userId, d]) => [userId, d.playoffDelta]),
            ),
          }}
        />
      )}

      {!data && preseasonData && <OddsTable history={history} entries={preseasonData.entries} />}

      <p className="text-xs text-muted">
        {data
          ? <>Each simulated season replays the rest of the regular season using every remaining
            matchup&apos;s Elo win probability, seeds the top {data.playoffTeams} by simulated
            record (points as tiebreak, same as real standings), then plays out the actual
            playoff bracket. Simulated box scores (used only to break seeding ties) are drawn
            from each manager&apos;s own scoring history - win/loss itself always comes from
            Elo.</>
          : preseasonData
            ? <>Each simulated season has every manager play every other manager once, decided by
              career Elo win probability, seeds the top {preseasonData.playoffTeams}, then plays
              out the real playoff bracket structure. There&apos;s no actual schedule to draw on
              yet, so treat this as a rough preseason power ranking, not a forecast.</>
            : null}
      </p>
    </div>
  );
}
