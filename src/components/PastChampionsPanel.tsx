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
    <div className="rounded-2xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-primary">
          Past Champions
        </h2>
      </div>
      {champions.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          No completed seasons yet.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {champions.map((c) => (
            <li key={c.season}>
              <Link
                to={c.champion ? `/manager/${c.champion.userId}` : "#"}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="w-12 shrink-0 text-sm font-semibold text-muted">
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
                  <p className="truncate text-sm font-medium text-primary">
                    {c.champion?.displayName ?? "Unknown"}
                  </p>
                  {c.runnerUp && (
                    <p className="truncate text-xs text-muted">
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
