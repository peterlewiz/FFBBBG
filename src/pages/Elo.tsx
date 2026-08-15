import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { computeEloRatings, getEloLeaderboard, winProbability } from "../lib/elo";
import { ScoreTrendChart, type ChartSeries } from "../components/ScoreTrendChart";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import { TeamBadge } from "../components/TeamBadge";
import { useNflState } from "../lib/useNflState";

export function Elo() {
  const { data, loading, error } = useLeagueHistory();
  const { state: nflState } = useNflState();
  const targetWeek = nflState?.week ?? null;

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
    const series: ChartSeries[] = userIds.map((userId) => ({
      key: userId,
      name: data.managers[userId]?.displayName ?? userId,
      color: teamColor(userId),
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
    if (!data || !eloResult || targetWeek === null) return [];
    const currentSeason = data.seasons[data.seasons.length - 1];
    if (!currentSeason || currentSeason.weeks.length === 0) return [];

    const rosterToUser = new Map(
      currentSeason.rosters
        .filter((r) => r.ownerUserId)
        .map((r) => [r.rosterId, r.ownerUserId as string]),
    );
    const weekRows = currentSeason.weeks.filter((w) => w.week === targetWeek);
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
  }, [data, eloResult, targetWeek]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Elo</h1>
        <p className="mt-1 text-sm text-muted">
          A simple Elo rating built from every historical matchup — higher rating means a
          manager has consistently beaten good teams by good margins. See the{" "}
          <Link to="/predictions" className="font-medium text-neon hover:underline">
            Predictions
          </Link>{" "}
          tab to make your own picks for the week.
        </p>
      </div>

      {upcomingMatchups.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">
              Elo Win Probability — Week {targetWeek}
            </h2>
          </div>
          <ul className="divide-y divide-line">
            {upcomingMatchups.map((m, i) => (
              <li
                key={i}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 text-sm sm:px-5"
              >
                <Link
                  to={`/manager/${m.managerA.userId}`}
                  className="flex min-w-0 items-center gap-2 hover:underline"
                >
                  <TeamBadge
                    userId={m.managerA.userId}
                    displayName={m.managerA.displayName}
                    size={26}
                  />
                  <span className="truncate font-medium text-primary">
                    {m.managerA.displayName}
                  </span>
                </Link>
                <span className="whitespace-nowrap text-xs font-semibold text-neon">
                  {(m.probA * 100).toFixed(0)}% – {((1 - m.probA) * 100).toFixed(0)}%
                </span>
                <Link
                  to={`/manager/${m.managerB.userId}`}
                  className="flex min-w-0 items-center justify-end gap-2 hover:underline"
                >
                  <span className="truncate font-medium text-primary">
                    {m.managerB.displayName}
                  </span>
                  <TeamBadge
                    userId={m.managerB.userId}
                    displayName={m.managerB.displayName}
                    size={26}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface shadow-sm">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-primary">Elo Leaderboard</h2>
        </div>
        <ol className="divide-y divide-line">
          {leaderboard.map((entry, i) => {
            const color = teamColor(entry.manager.userId);
            return (
              <li key={entry.manager.userId}>
                <Link
                  to={`/manager/${entry.manager.userId}`}
                  className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:gap-4 sm:px-5"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{
                      background: color,
                      boxShadow: `0 0 10px ${teamColorAlpha(entry.manager.userId, 0.7)}`,
                    }}
                  />
                  <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted">
                    {i + 1}
                  </span>
                  <TeamBadge
                    userId={entry.manager.userId}
                    displayName={entry.manager.displayName}
                    size={32}
                  />
                  <span className="flex-1 truncate text-sm font-medium text-primary">
                    {entry.manager.displayName}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold"
                    style={{
                      color,
                      background: teamColorAlpha(entry.manager.userId, 0.12),
                      border: `1px solid ${teamColorAlpha(entry.manager.userId, 0.35)}`,
                    }}
                  >
                    {entry.rating}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-primary">
            Rating over time
          </h2>
          <ScoreTrendChart data={chartData} series={series} xKey="label" yLabel="Elo rating" />
        </div>
      )}
    </div>
  );
}
