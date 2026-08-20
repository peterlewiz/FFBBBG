import { Link } from "react-router-dom";
import type { AllTimePowerRankEntry } from "../lib/powerRankings";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import { TeamBadge } from "./TeamBadge";

function rankMedal(rank: number): string | null {
  if (rank === 0) return "🥇";
  if (rank === 1) return "🥈";
  if (rank === 2) return "🥉";
  return null;
}

export function PowerRankingsWidget({
  entries,
  limit,
  draftOrder,
}: {
  entries: AllTimePowerRankEntry[];
  limit?: number;
  /** userId -> this season's draft slot (1 = first overall), if set. */
  draftOrder?: Record<string, number> | null;
}) {
  const shown = limit ? entries.slice(0, limit) : entries;

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-primary">All-Time Power Rankings</h2>
        <p className="text-xs text-muted">
          Ranked by career championships, playoff appearances, win rate &amp; scoring
        </p>
      </div>
      <ol className="divide-y divide-line">
        {shown.map((entry, i) => {
          const color = teamColor(entry.manager.userId);
          return (
            <li key={entry.manager.userId}>
              <Link
                to={`/manager/${entry.manager.userId}`}
                className="relative flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
              >
                {/* team-color edge stripe */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ background: color, boxShadow: `0 0 10px ${teamColorAlpha(entry.manager.userId, 0.7)}` }}
                />
                <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted">
                  {rankMedal(i) ?? i + 1}
                </span>
                <TeamBadge userId={entry.manager.userId} displayName={entry.manager.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-primary">
                    {entry.manager.displayName}
                    {/* Not in this year's draft = no longer in the league. */}
                    {draftOrder && draftOrder[entry.manager.userId] === undefined && (
                      <span className="ml-1" title="No longer in the league">
                        💀
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {entry.titles > 0 && (
                      <span className="mr-1">{"🏆".repeat(Math.min(entry.titles, 5))}</span>
                    )}
                    {(entry.careerWinPct * 100).toFixed(0)}% career win rate ·{" "}
                    {entry.playoffAppearances}/{entry.seasonsPlayed} playoffs
                  </p>
                </div>
                {draftOrder?.[entry.manager.userId] !== undefined && (
                  <span className="hidden shrink-0 rounded-full border border-line px-2 py-1 text-[11px] font-medium text-muted sm:inline-block">
                    Pick {draftOrder[entry.manager.userId]}
                  </span>
                )}
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold"
                  style={{
                    color,
                    background: teamColorAlpha(entry.manager.userId, 0.12),
                    border: `1px solid ${teamColorAlpha(entry.manager.userId, 0.35)}`,
                  }}
                >
                  {entry.score.toFixed(1)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
