import { Link } from "react-router-dom";
import type { AllTimePowerRankEntry } from "../lib/powerRankings";

function rankMedal(rank: number): string | null {
  if (rank === 0) return "🥇";
  if (rank === 1) return "🥈";
  if (rank === 2) return "🥉";
  return null;
}

export function PowerRankingsWidget({
  entries,
  limit,
}: {
  entries: AllTimePowerRankEntry[];
  limit?: number;
}) {
  const shown = limit ? entries.slice(0, limit) : entries;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          All-Time Power Rankings
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ranked by career championships, playoff appearances, win rate & scoring
        </p>
      </div>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">
        {shown.map((entry, i) => (
          <li key={entry.manager.userId}>
            <Link
              to={`/manager/${entry.manager.userId}`}
              className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span className="w-6 shrink-0 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
                {rankMedal(i) ?? i + 1}
              </span>
              <img
                src={
                  entry.manager.avatar
                    ? `https://sleepercdn.com/avatars/thumbs/${entry.manager.avatar}`
                    : "https://sleepercdn.com/images/v2/icons/player_default.webp"
                }
                alt=""
                className="h-9 w-9 shrink-0 rounded-full bg-slate-100 object-cover dark:bg-slate-800"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {entry.manager.displayName}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {entry.titles > 0 && (
                    <span className="mr-1">
                      {"🏆".repeat(Math.min(entry.titles, 5))}
                    </span>
                  )}
                  {(entry.careerWinPct * 100).toFixed(0)}% career win rate ·{" "}
                  {entry.playoffAppearances}/{entry.seasonsPlayed} playoffs
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                {entry.score.toFixed(1)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
