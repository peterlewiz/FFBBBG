import { useMemo } from "react";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { computeEloRatings, getEloLeaderboard, winProbability } from "../lib/elo";
import { CHART_PALETTE, ScoreTrendChart, type ChartSeries } from "../components/ScoreTrendChart";

export function Elo() {
  const { data, loading, error } = useLeagueHistory();

  const eloResult = useMemo(() => (data ? computeEloRatings(data) : null), [data]);
  const leaderboard = useMemo(
    () => (data && eloResult ? getEloLeaderboard(data, eloResult) : []),
    [data, eloResult],
  );

  const { chartData, series } = useMemo(() => {
    if (!data || !eloResult || eloResult.history.length === 0) {
      return { chartData: [], series: [] as ChartSeries[] };
    }
    const userIds = Object.keys(data.managers).sort();
    const series: ChartSeries[] = userIds.map((userId, i) => ({
      key: userId,
      name: data.managers[userId]?.displayName ?? userId,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
    }));
    const chartData = eloResult.history.map((snap) => {
      const row: Record<string, number | string> = {
        label: `${snap.season} Wk ${snap.week}`,
      };
      for (const userId of userIds) {
        row[userId] = Math.round(snap.ratings[userId] ?? 1500);
      }
      return row;
    });
    return { chartData, series };
  }, [data, eloResult]);

  const upcomingMatchups = useMemo(() => {
    if (!data || !eloResult) return [];
    const currentSeason = data.seasons[data.seasons.length - 1];
    if (!currentSeason || currentSeason.weeks.length === 0) return [];

    const maxWeek = Math.max(...currentSeason.weeks.map((w) => w.week));
    const rosterToUser = new Map(
      currentSeason.rosters
        .filter((r) => r.ownerUserId)
        .map((r) => [r.rosterId, r.ownerUserId as string]),
    );
    const weekRows = currentSeason.weeks.filter((w) => w.week === maxWeek);
    const byMatchup = new Map<number, typeof weekRows>();
    for (const row of weekRows) {
      if (row.matchupId === null) continue;
      const arr = byMatchup.get(row.matchupId) ?? [];
      arr.push(row);
      byMatchup.set(row.matchupId, arr);
    }

    return Array.from(byMatchup.values())
      .filter((pair) => pair.length === 2)
      .map((pair) => {
        const [a, b] = pair;
        const userA = rosterToUser.get(a.rosterId);
        const userB = rosterToUser.get(b.rosterId);
        if (!userA || !userB) return null;
        const ratingA = eloResult.ratings[userA] ?? 1500;
        const ratingB = eloResult.ratings[userB] ?? 1500;
        return {
          managerA: data.managers[userA],
          managerB: data.managers[userB],
          probA: winProbability(ratingA, ratingB),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [data, eloResult]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Elo</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          A simple Elo rating built from every historical matchup — higher rating means a
          manager has consistently beaten good teams by good margins. See the{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">Predictions</span>{" "}
          tab to make your own picks for the week.
        </p>
      </div>

      {upcomingMatchups.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Elo Win Probability — This Week
            </h2>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingMatchups.map((m, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium text-slate-900 dark:text-white">
                  {m.managerA.displayName}
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {(m.probA * 100).toFixed(0)}% – {((1 - m.probA) * 100).toFixed(0)}%
                </span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {m.managerB.displayName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Elo Leaderboard</h2>
        </div>
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {leaderboard.map((entry, i) => (
            <li key={entry.manager.userId} className="flex items-center gap-4 px-5 py-3">
              <span className="w-6 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                {entry.manager.displayName}
              </span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {entry.rating}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Rating over time
          </h2>
          <ScoreTrendChart data={chartData} series={series} xKey="label" yLabel="Elo rating" />
        </div>
      )}
    </div>
  );
}
