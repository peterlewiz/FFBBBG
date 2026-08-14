import { Link } from "react-router-dom";
import type { ChampionEntry } from "../lib/champions";

export function PastChampionsPanel({
  champions,
  trophyImageSrc,
}: {
  champions: ChampionEntry[];
  /** Optional trophy photo shown next to each entry instead of the emoji. */
  trophyImageSrc?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Past Champions
        </h2>
      </div>
      {champions.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">
          No completed seasons yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {champions.map((c) => (
            <li key={c.season}>
              <Link
                to={c.champion ? `/manager/${c.champion.userId}` : "#"}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="w-12 shrink-0 text-sm font-semibold text-slate-400 dark:text-slate-500">
                  {c.season}
                </span>
                {trophyImageSrc ? (
                  <img
                    src={trophyImageSrc}
                    alt="Trophy"
                    className="h-7 w-7 shrink-0 rounded object-contain"
                  />
                ) : (
                  <span className="text-lg">🏆</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {c.champion?.displayName ?? "Unknown"}
                  </p>
                  {c.runnerUp && (
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      beat {c.runnerUp.displayName}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
