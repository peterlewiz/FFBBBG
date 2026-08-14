import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { HeadToHeadPanel } from "../components/HeadToHeadPanel";

export function History() {
  const { data, loading, error } = useLeagueHistory();

  const completedSeasons = useMemo(
    () => (data ? data.seasons.filter((s) => s.rosters.length > 0).slice().reverse() : []),
    [data],
  );

  const [selected, setSelected] = useState<string | null>(null);
  const activeSeason = completedSeasons.find((s) => s.season === selected) ?? completedSeasons[0];

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  if (!activeSeason) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No season data available yet.
      </p>
    );
  }

  const standings = activeSeason.rosters
    .filter((r) => r.ownerUserId && data.managers[r.ownerUserId])
    .map((r) => {
      const games = r.wins + r.losses + r.ties;
      return {
        manager: data.managers[r.ownerUserId as string],
        rosterId: r.rosterId,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        pointsFor: r.pointsFor,
        pointsAgainst: r.pointsAgainst,
        winPct: games > 0 ? (r.wins + r.ties * 0.5) / games : 0,
        isChampion: activeSeason.championRosterId === r.rosterId,
      };
    })
    .sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
          Season History
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Final standings for each season, plus all-time head-to-head records.
        </p>
      </div>

      <HeadToHeadPanel history={data} />

      <div className="flex flex-wrap gap-2">
        {completedSeasons.map((s) => (
          <button
            key={s.season}
            onClick={() => setSelected(s.season)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              s.season === activeSeason.season
                ? "bg-emerald-500 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800"
            }`}
          >
            {s.season}
            {s.status !== "complete" && (
              <span className="ml-1 opacity-70">
                ({s.status === "pre_draft" ? "upcoming" : "in progress"})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Manager</th>
              <th className="px-4 py-3 font-medium">Record</th>
              <th className="px-4 py-3 font-medium">PF</th>
              <th className="px-4 py-3 font-medium">PA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {standings.map((row, i) => {
              const seasonTeamName =
                row.manager.teamNameBySeason[activeSeason.season] ?? row.manager.teamName;
              return (
                <tr key={row.rosterId}>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/manager/${row.manager.userId}`}
                      className="font-medium text-slate-900 hover:underline dark:text-white"
                    >
                      {row.isChampion && <span className="mr-1.5">🏆</span>}
                      {row.manager.displayName}
                    </Link>
                    {seasonTeamName !== row.manager.displayName && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {seasonTeamName}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {row.wins}-{row.losses}
                    {row.ties > 0 ? `-${row.ties}` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {row.pointsFor.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {row.pointsAgainst.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
