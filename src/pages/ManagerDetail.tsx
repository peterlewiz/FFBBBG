import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { buildManagerSeasonLines } from "../lib/powerRankings";
import { computeEloRatings, getEloLeaderboard } from "../lib/elo";
import { countTitles } from "../lib/champions";
import { ScoreTrendChart, type ChartSeries } from "../components/ScoreTrendChart";
import { teamColor } from "../lib/teamColors";
import { ManagerCard } from "../components/ManagerCard";
import { usePredictions } from "../lib/usePredictions";
import { computeLeaderboard } from "../lib/predictions";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { ROOT_LEAGUE_ID } from "../lib/history";

export function ManagerDetail() {
  const { userId } = useParams<{ userId: string }>();
  const { data, loading, error } = useLeagueHistory();

  const seasonLines = useMemo(
    () => (data && userId ? buildManagerSeasonLines(data)[userId] ?? [] : []),
    [data, userId],
  );

  const eloResult = useMemo(() => (data ? computeEloRatings(data) : null), [data]);
  const eloRank = useMemo(() => {
    if (!data || !eloResult || !userId) return null;
    const board = getEloLeaderboard(data, eloResult);
    const idx = board.findIndex((e) => e.manager.userId === userId);
    return idx === -1 ? null : { rating: board[idx].rating, rank: idx + 1, of: board.length };
  }, [data, eloResult, userId]);

  const predictionsState = usePredictions(ROOT_LEAGUE_ID);
  const predictionStats = useMemo(() => {
    if (!data || !userId) return null;
    const board = computeLeaderboard(data, predictionsState.data);
    return board.find((e) => e.manager.userId === userId) ?? null;
  }, [data, predictionsState.data, userId]);

  const { chartData, series } = useMemo(() => {
    if (!seasonLines.length) return { chartData: [], series: [] as ChartSeries[] };
    const series: ChartSeries[] = [{ key: "points", name: "Points", color: teamColor(userId ?? "") }];
    const chartData: Record<string, number | string>[] = [];
    for (const line of seasonLines) {
      line.weeklyScores.forEach((points, i) => {
        chartData.push({ label: `${line.season} Wk ${i + 1}`, points: Math.round(points * 10) / 10 });
      });
    }
    return { chartData, series };
  }, [seasonLines]);

  if (loading) return <LoadingScreen />;
  if (error || !data || !userId) return <ErrorScreen message={error ?? "Unknown manager"} />;

  const manager = data.managers[userId];
  if (!manager) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <p className="text-lg font-medium text-primary">Manager not found</p>
        <Link to="/" className="text-sm text-neon hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const totalWins = seasonLines.reduce((a, l) => a + l.wins, 0);
  const totalLosses = seasonLines.reduce((a, l) => a + l.losses, 0);
  const totalTies = seasonLines.reduce((a, l) => a + l.ties, 0);
  const totalGames = totalWins + totalLosses + totalTies;
  const careerWinPct = totalGames > 0 ? (totalWins + totalTies * 0.5) / totalGames : 0;
  const careerPF = seasonLines.reduce((a, l) => a + l.pointsFor, 0);
  const careerPA = seasonLines.reduce((a, l) => a + l.pointsAgainst, 0);
  // Shared helper so this includes pre-Sleeper titles too.
  const titles = countTitles(data, userId);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" className="text-sm text-muted hover:text-primary">
        ← Back to home
      </Link>

      <ManagerCard
        manager={manager}
        stats={{
          record: `${totalWins}-${totalLosses}${totalTies ? `-${totalTies}` : ""}`,
          winPct: careerWinPct,
          pointsFor: careerPF,
          titles,
          elo: eloRank?.rating ?? null,
          eloRank: eloRank?.rank ?? null,
          seasons: seasonLines.length,
          trend: seasonLines.flatMap((l) => l.weeklyScores),
        }}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Points Against" value={careerPA.toFixed(0)} />
        <StatTile
          label="Playoff Trips"
          value={`${seasonLines.filter((l) => l.madePlayoffs).length}`}
          sub={`of ${seasonLines.length} seasons`}
        />
        {eloRank && (
          <StatTile label="Elo Rank" value={`#${eloRank.rank}`} sub={`of ${eloRank.of} managers`} />
        )}
        {isSupabaseConfigured && predictionStats && predictionStats.total > 0 && (
          <StatTile
            label="Prediction Accuracy"
            value={`${(predictionStats.accuracy * 100).toFixed(0)}%`}
            sub={`${predictionStats.correct}/${predictionStats.total} correct picks`}
          />
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-primary">Season by season</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3 font-medium sm:px-4">Season</th>
                <th className="px-3 py-3 font-medium sm:px-4">Team Name</th>
                <th className="px-3 py-3 font-medium sm:px-4">Record</th>
                <th className="px-3 py-3 font-medium sm:px-4">PF</th>
                <th className="px-3 py-3 font-medium sm:px-4">PA</th>
                <th className="px-3 py-3 font-medium sm:px-4">Playoffs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {seasonLines
                .slice()
                .reverse()
                .map((l) => (
                  <tr key={l.season}>
                    <td className="px-3 py-3 font-medium text-primary sm:px-4">{l.season}</td>
                    <td className="px-3 py-3 text-body sm:px-4">
                      {manager.teamNameBySeason[l.season] ?? manager.teamName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-body sm:px-4">
                      {l.wins}-{l.losses}
                      {l.ties > 0 ? `-${l.ties}` : ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-body sm:px-4">
                      {l.pointsFor.toFixed(1)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-body sm:px-4">
                      {l.pointsAgainst.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-body sm:px-4">{l.madePlayoffs ? "✅" : "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-primary">
            Weekly scoring, career
          </h2>
          <ScoreTrendChart data={chartData} series={series} xKey="label" yLabel="Points" />
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  wide,
}: {
  label: string;
  value: string;
  sub?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-4 shadow-sm ${wide ? "sm:col-span-4" : ""}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
