import { Link } from "react-router-dom";
import type { LeagueHistory } from "../lib/history";
import { getSackoCounts, getSackoHistory, getWorstActiveStreak } from "../lib/sacko";
import { TeamBadge } from "./TeamBadge";

const SHAME = "#ff5a3c"; // deliberately off-palette - this isn't a team color

/** Last place, immortalised. */
export function SackoPanel({ history }: { history: LeagueHistory }) {
  const seasons = getSackoHistory(history);
  const counts = getSackoCounts(history);
  const skid = getWorstActiveStreak(history);

  if (seasons.length === 0) return null;
  const reigning = seasons[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-primary">Hall of Shame</h2>
        <p className="text-xs text-muted">Last place, never forgotten</p>
      </div>

      {reigning.manager && (
        <div
          className="relative flex items-center gap-3 border-b border-line px-5 py-4"
          style={{ background: `linear-gradient(90deg, ${SHAME}1a, transparent)` }}
        >
          <span className="text-3xl" aria-hidden>
            🚽
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: SHAME }}>
              Reigning sacko
            </p>
            <Link
              to={`/manager/${reigning.manager.userId}`}
              className="truncate text-base font-bold text-primary hover:underline"
            >
              {reigning.manager.displayName}
            </Link>
            <p className="text-xs text-muted">
              {reigning.season} · {reigning.wins}-{reigning.losses} ·{" "}
              {reigning.pointsFor.toFixed(0)} pts
            </p>
          </div>
        </div>
      )}

      {skid && skid.length >= 3 && (
        <div className="border-b border-line px-5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Longest active skid
          </p>
          <p className="mt-0.5 text-sm text-body">
            <Link
              to={`/manager/${skid.manager.userId}`}
              className="font-semibold text-primary hover:underline"
            >
              {skid.manager.displayName}
            </Link>{" "}
            has lost <span style={{ color: SHAME }}>{skid.length} straight</span>
          </p>
        </div>
      )}

      <ul className="divide-y divide-line">
        {counts.map((c) => (
          <li key={c.manager.userId}>
            <Link
              to={`/manager/${c.manager.userId}`}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
            >
              <TeamBadge userId={c.manager.userId} displayName={c.manager.displayName} size={26} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">
                  {c.manager.displayName}
                </p>
                <p className="truncate text-xs text-muted">{c.seasons.join(" · ")}</p>
              </div>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{
                  color: SHAME,
                  background: `${SHAME}1f`,
                  border: `1px solid ${SHAME}55`,
                }}
              >
                {c.count}× last
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
