import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { buildManagerSeasonLines } from "../lib/powerRankings";
import { computeEloRatings, getEloLeaderboard } from "../lib/elo";
import { ScoreTrendChart, type ChartSeries } from "../components/ScoreTrendChart";
import { teamColor } from "../lib/teamColors";
import { TeamBadge } from "../components/TeamBadge";
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
  const titles = data.seasons.filter((s) => {
    const roster = s.rosters.find((r) => r.ownerUserId === userId);
    return roster && s.championRosterId === roster.rosterId;
  }).length;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" className="text-sm text-muted hover:text-primary">
        ← Back to home
      </Link>

      <div className="flex items-center gap-4">
        <TeamBadge userId={manager.userId} displayName={manager.displayName} size={64} />
        <div>
          <h1
            className="text-2xl font-bold sm:text-3xl"
            style={{ color: teamColor(manager.userId), textShadow: `0 0 24px ${teamColor(manager.userId)}55` }}
          >
            {manager.displayName}
          </h1>
          <p className="text-sm text-muted">
            {titles > 0 && <span className="mr-1">{"🏆".repeat(Math.min(titles, 5))}</span>}
            {seasonLines.length} seasons played
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Career Record" value={`${totalWins}-${totalLosses}${totalTies ? `-${totalTies}` : ""}`} />
        <StatTile label="Career Win %" value={`${(careerWinPct * 100).toFixed(0)}%`} />
        <StatTile label="Points For" value={careerPF.toFixed(0)} />
        <StatTile label="Points Against" value={careerPA.toFixed(0)} />
      </div>

      {(eloRank || (isSupabaseConfigured && predictionStats && predictionStats.total > 0)) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {eloRank && (
            <StatTile
              label="Elo Rating"
              value={`${eloRank.rating}`}
              sub={`#${eloRank.rank} of ${eloRank.of} managers`}
            />
          )}
          {isSupabaseConfigured && predictionStats && predictionStats.total > 0 && (
            <StatTile
              label="Prediction Accuracy"
              value={`${(predictionStats.accuracy * 100).toFixed(0)}%`}
              sub={`${predictionStats.correct}/${predictionStats.total} correct picks`}
            />
          )}
        </div>
      )}

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
