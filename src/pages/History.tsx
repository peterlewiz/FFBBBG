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
      <p className="text-sm text-muted">
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
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          Season History
        </h1>
        <p className="mt-1 text-sm text-muted">
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
                ? "bg-neon text-ink"
                : "bg-surface text-body ring-1 ring-line hover:bg-surface"
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

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Manager</th>
              <th className="px-4 py-3 font-medium">Record</th>
              <th className="px-4 py-3 font-medium">PF</th>
              <th className="px-4 py-3 font-medium">PA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {standings.map((row, i) => {
              const seasonTeamName =
                row.manager.teamNameBySeason[activeSeason.season] ?? row.manager.teamName;
              return (
                <tr key={row.rosterId}>
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/manager/${row.manager.userId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.isChampion && <span className="mr-1.5">🏆</span>}
                      {row.manager.displayName}
                    </Link>
                    {seasonTeamName !== row.manager.displayName && (
                      <p className="text-xs text-muted">
                        {seasonTeamName}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-body">
                    {row.wins}-{row.losses}
                    {row.ties > 0 ? `-${row.ties}` : ""}
                  </td>
                  <td className="px-4 py-3 text-body">
                    {row.pointsFor.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-body">
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
