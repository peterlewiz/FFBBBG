import { useMemo, useState } from "react";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { CHART_PALETTE, ScoreTrendChart, type ChartSeries } from "../components/ScoreTrendChart";
import type { LeagueHistory } from "../lib/history";

function useAllTimeStats(data: LeagueHistory | null) {
  return useMemo(() => {
    if (!data) return null;

    let highest = { points: -Infinity, manager: "", season: "", week: 0 };
    let lowest = { points: Infinity, manager: "", season: "", week: 0 };
    let biggestBlowout = { margin: -Infinity, winner: "", loser: "", season: "", week: 0 };

    for (const season of data.seasons) {
      const rosterToUser = new Map(
        season.rosters.filter((r) => r.ownerUserId).map((r) => [r.rosterId, r.ownerUserId as string]),
      );

      for (const w of season.weeks) {
        const userId = rosterToUser.get(w.rosterId);
        const name = userId ? data.managers[userId]?.displayName : undefined;
        if (!name) continue;
        if (w.points > highest.points) {
          highest = { points: w.points, manager: name, season: season.season, week: w.week };
        }
        if (w.points < lowest.points && w.points > 0) {
          lowest = { points: w.points, manager: name, season: season.season, week: w.week };
        }
      }

      const byMatchup = new Map<string, typeof season.weeks>();
      for (const w of season.weeks) {
        if (w.matchupId === null) continue;
        const key = `${w.week}:${w.matchupId}`;
        const arr = byMatchup.get(key) ?? [];
        arr.push(w);
        byMatchup.set(key, arr);
      }
      for (const pair of byMatchup.values()) {
        if (pair.length !== 2) continue;
        const [a, b] = pair;
        const margin = Math.abs(a.points - b.points);
        if (margin > biggestBlowout.margin) {
          const winner = a.points > b.points ? a : b;
          const loser = a.points > b.points ? b : a;
          const winnerUser = rosterToUser.get(winner.rosterId);
          const loserUser = rosterToUser.get(loser.rosterId);
          biggestBlowout = {
            margin,
            winner: winnerUser ? data.managers[winnerUser]?.displayName ?? "?" : "?",
            loser: loserUser ? data.managers[loserUser]?.displayName ?? "?" : "?",
            season: season.season,
            week: a.week,
          };
        }
      }
    }

    return { highest, lowest, biggestBlowout };
  }, [data]);
}

export function Graphs() {
  const { data, loading, error } = useLeagueHistory();
  const stats = useAllTimeStats(data);

  const seasonsWithGames = useMemo(
    () => (data ? data.seasons.filter((s) => s.weeks.length > 0) : []),
    [data],
  );
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  const activeSeason =
    seasonsWithGames.find((s) => s.season === selectedSeason) ??
    seasonsWithGames[seasonsWithGames.length - 1];

  const { chartData, series } = useMemo(() => {
    if (!data || !activeSeason) return { chartData: [], series: [] as ChartSeries[] };

    const rosterToUser = new Map(
      activeSeason.rosters
        .filter((r) => r.ownerUserId)
        .map((r) => [r.rosterId, r.ownerUserId as string]),
    );
    const userIds = Array.from(new Set(rosterToUser.values())).sort();

    const series: ChartSeries[] = userIds.map((userId, i) => ({
      key: userId,
      name: data.managers[userId]?.displayName ?? userId,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
    }));

    const weeks = Array.from(new Set(activeSeason.weeks.map((w) => w.week))).sort((a, b) => a - b);
    const chartData = weeks.map((week) => {
      const row: Record<string, number | string> = { week: `Wk ${week}` };
      for (const w of activeSeason.weeks) {
        if (w.week !== week) continue;
        const userId = rosterToUser.get(w.rosterId);
        if (userId) row[userId] = Math.round(w.points * 10) / 10;
      }
      return row;
    });

    return { chartData, series };
  }, [data, activeSeason]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Graphs</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Weekly scoring trends and all-time league trivia.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Highest single-week score"
            value={stats.highest.points.toFixed(1)}
            sub={`${stats.highest.manager} · ${stats.highest.season} Wk ${stats.highest.week}`}
          />
          <StatCard
            label="Lowest single-week score"
            value={stats.lowest.points.toFixed(1)}
            sub={`${stats.lowest.manager} · ${stats.lowest.season} Wk ${stats.lowest.week}`}
          />
          <StatCard
            label="Biggest blowout"
            value={`+${stats.biggestBlowout.margin.toFixed(1)}`}
            sub={`${stats.biggestBlowout.winner} over ${stats.biggestBlowout.loser} · ${stats.biggestBlowout.season} Wk ${stats.biggestBlowout.week}`}
          />
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Weekly scores
          </h2>
          <div className="flex flex-wrap gap-2">
            {seasonsWithGames.map((s) => (
              <button
                key={s.season}
                onClick={() => setSelectedSeason(s.season)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  s.season === activeSeason?.season
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {s.season}
              </button>
            ))}
          </div>
        </div>
        {chartData.length > 0 ? (
          <ScoreTrendChart data={chartData} series={series} xKey="week" yLabel="Points" />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No games played yet.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{sub}</p>
    </div>
  );
}
