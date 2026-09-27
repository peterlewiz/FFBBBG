import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import type { Manager } from "../lib/history";

/**
 * Same key the Predictions page stores "who are you?" under, so picking
 * yourself on either page counts for both.
 */
const PICKER_STORAGE_KEY = "sleeper-site:picker-user-id";

function readYou(): string | null {
  try {
    return window.localStorage.getItem(PICKER_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface TeamRow {
  manager: Manager;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  rank: number;
}

/**
 * Every team in the league, in standings order, each linking to its
 * manager page.
 *
 * Those pages were only reachable by clicking a name somewhere else on the
 * site - none of the navigation led to them. This puts all twelve one tap
 * away, with your own team highlighted in its real place in the standings.
 */
export function Teams() {
  const { data, loading, error } = useLeagueHistory();
  const [you, setYou] = useState<string | null>(readYou);

  const rows = useMemo<TeamRow[]>(() => {
    const season = data?.seasons[data.seasons.length - 1];
    if (!data || !season) return [];
    return season.rosters
      .map((r) => {
        const manager = r.ownerUserId ? data.managers[r.ownerUserId] : undefined;
        return manager
          ? { manager, wins: r.wins, losses: r.losses, ties: r.ties, pointsFor: r.pointsFor }
          : null;
      })
      .filter((r): r is Omit<TeamRow, "rank"> => r !== null)
      .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  const season = data.seasons[data.seasons.length - 1]?.season ?? "";
  // Highlighted where it actually stands rather than moved to the top: a
  // 6th-placed team sitting first read as though it were leading.
  const yours = rows.find((r) => r.manager.userId === you);

  function chooseYou(userId: string) {
    setYou(userId || null);
    try {
      if (userId) window.localStorage.setItem(PICKER_STORAGE_KEY, userId);
      else window.localStorage.removeItem(PICKER_STORAGE_KEY);
    } catch {
      // Not persisting is fine - it just won't be remembered next visit.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">Teams</h1>
          <p className="mt-1 text-sm text-muted">
            Every team in the {season} season, in standings order. Tap one for their full history.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Your team
          <select
            value={yours ? you ?? "" : ""}
            onChange={(e) => chooseYou(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary"
          >
            <option value="">Choose…</option>
            {[...rows]
              .sort((a, b) => a.manager.displayName.localeCompare(b.manager.displayName))
              .map((r) => (
                <option key={r.manager.userId} value={r.manager.userId}>
                  {r.manager.displayName}
                </option>
              ))}
          </select>
        </label>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <li key={row.manager.userId}>
            <TeamCard row={row} isYou={row === yours} season={season} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamCard({ row, isYou, season }: { row: TeamRow; isYou: boolean; season: string }) {
  const { manager } = row;
  const color = teamColor(manager.userId);
  const teamName = manager.teamNameBySeason[season] ?? manager.teamName;
  const record = `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;

  return (
    <Link
      to={`/manager/${manager.userId}`}
      className="flex items-center gap-3 rounded-2xl border bg-surface p-3 transition-colors hover:bg-surface-2"
      style={{
        borderColor: isYou ? color : undefined,
        boxShadow: isYou ? `0 0 24px ${teamColorAlpha(manager.userId, 0.25)}` : undefined,
      }}
    >
      <span className="w-6 shrink-0 text-center text-sm font-bold text-muted">{row.rank}</span>
      <img
        src={`/manager-avatars/${manager.userId}.png`}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full object-cover"
        style={{ border: `2px solid ${color}` }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold" style={{ color }}>
            {manager.displayName}
          </span>
          {isYou && (
            <span
              className="shrink-0 rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wider"
              style={{ color, background: teamColorAlpha(manager.userId, 0.15) }}
            >
              You
            </span>
          )}
        </span>
        {teamName !== manager.displayName && (
          <span className="block truncate text-xs text-muted">{teamName}</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-primary">{record}</span>
        <span className="block text-[11px] tabular-nums text-muted">
          {row.pointsFor.toFixed(1)} pts
        </span>
      </span>
    </Link>
  );
}
