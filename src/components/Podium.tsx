import { Link } from "react-router-dom";
import type { AllTimePowerRankEntry } from "../lib/powerRankings";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import { useCountUp } from "../lib/motion";

// Rendered 2nd, 1st, 3rd so the winner stands in the middle.
const ORDER = [1, 0, 2];
// Indexed by place, so first place gets the tallest plinth.
const HEIGHTS = ["h-24", "h-16", "h-12"];
const MEDALS = ["🥇", "🥈", "🥉"];

function Step({ entry, place }: { entry: AllTimePowerRankEntry; place: number }) {
  const color = teamColor(entry.manager.userId);
  const score = useCountUp(entry.score, 1000, 1);
  const isFirst = place === 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
      <Link
        to={`/manager/${entry.manager.userId}`}
        className="flex min-w-0 flex-col items-center gap-1.5"
      >
        <div className="relative">
          <img
            src={`/manager-avatars/${entry.manager.userId}.png`}
            alt=""
            className={`rounded-full object-cover ${isFirst ? "h-16 w-16 sm:h-20 sm:w-20" : "h-12 w-12 sm:h-14 sm:w-14"}`}
            style={{
              border: `2px solid ${color}`,
              boxShadow: `0 0 ${isFirst ? 30 : 18}px ${teamColorAlpha(entry.manager.userId, 0.6)}`,
            }}
          />
          <span className="absolute -bottom-1 -right-1 text-lg drop-shadow sm:text-xl">
            {MEDALS[place]}
          </span>
        </div>
        <p
          className="max-w-[6.5rem] truncate text-center text-xs font-bold sm:max-w-[9rem] sm:text-sm"
          style={{ color }}
        >
          {entry.manager.displayName}
        </p>
      </Link>

      <span ref={score.ref} className="text-sm font-black tabular-nums text-primary sm:text-base">
        {score.display}
      </span>

      {/* the plinth */}
      <div
        className={`w-full rounded-t-lg border border-b-0 ${HEIGHTS[place]}`}
        style={{
          borderColor: teamColorAlpha(entry.manager.userId, 0.5),
          background: `linear-gradient(180deg, ${teamColorAlpha(entry.manager.userId, 0.28)}, transparent)`,
          boxShadow: `inset 0 1px 0 ${color}`,
        }}
      />
    </div>
  );
}

/** Top three of the all-time rankings, on an actual podium. */
export function Podium({ entries }: { entries: AllTimePowerRankEntry[] }) {
  const top = entries.slice(0, 3);
  if (top.length < 3) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface px-4 pt-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background: `radial-gradient(60% 100% at 50% 0%, ${teamColorAlpha(top[0].manager.userId, 0.18)}, transparent 70%)`,
        }}
      />
      <p className="relative mb-4 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-muted">
        All-Time Top 3
      </p>
      <div className="relative flex items-end gap-2 sm:gap-4">
        {ORDER.map((i) => (
          <Step key={top[i].manager.userId} entry={top[i]} place={i} />
        ))}
      </div>
    </div>
  );
}
