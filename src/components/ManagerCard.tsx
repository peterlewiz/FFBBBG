import type { Manager } from "../lib/history";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import { Sparkline } from "./Sparkline";
import { TiltCard } from "./TiltCard";
import { useCountUp } from "../lib/motion";

export interface ManagerCardStats {
  record: string;
  winPct: number;
  pointsFor: number;
  titles: number;
  elo: number | null;
  eloRank: number | null;
  seasons: number;
  /** Weekly scores across their career, for the sparkline. */
  trend: number[];
}

/** Trading-card style summary of a manager, foiled in their neon color. */
export function ManagerCard({
  manager,
  stats,
}: {
  manager: Manager;
  stats: ManagerCardStats;
}) {
  const color = teamColor(manager.userId);
  const elo = useCountUp<HTMLParagraphElement>(stats.elo ?? 0, 1100, 0);

  return (
    <TiltCard accent={color} className="rounded-2xl">
      <div
        className="relative overflow-hidden rounded-2xl border bg-surface"
        style={{
          borderColor: teamColorAlpha(manager.userId, 0.55),
          boxShadow: `0 0 40px ${teamColorAlpha(manager.userId, 0.18)}`,
        }}
      >
        {/* foil corner wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(90% 60% at 100% 0%, ${teamColorAlpha(manager.userId, 0.22)}, transparent 65%)`,
          }}
        />

        <div className="relative flex items-center gap-4 p-5">
          <img
            src={`/manager-avatars/${manager.userId}.png`}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-24 sm:w-24"
            style={{
              border: `2px solid ${color}`,
              boxShadow: `0 0 24px ${teamColorAlpha(manager.userId, 0.5)}`,
            }}
          />

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              {stats.seasons} seasons
            </p>
            <h1
              className="truncate text-2xl font-black sm:text-3xl"
              style={{ color, textShadow: `0 0 26px ${teamColorAlpha(manager.userId, 0.55)}` }}
            >
              {manager.displayName}
            </h1>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-body">
              {stats.titles > 0 ? (
                <>
                  <span>{"🏆".repeat(Math.min(stats.titles, 5))}</span>
                  <span className="text-muted">
                    {stats.titles} title{stats.titles === 1 ? "" : "s"}
                  </span>
                </>
              ) : (
                <span className="text-muted">Still chasing a title</span>
              )}
            </p>
          </div>

          {stats.elo !== null && (
            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Elo</p>
              <p
                ref={elo.ref}
                className="text-3xl font-black tabular-nums"
                style={{ color, textShadow: `0 0 20px ${teamColorAlpha(manager.userId, 0.5)}` }}
              >
                {elo.display}
              </p>
              {stats.eloRank && <p className="text-[11px] text-muted">#{stats.eloRank} all-time</p>}
            </div>
          )}
        </div>

        {/* stat strip */}
        <div
          className="relative grid grid-cols-3 divide-x border-t"
          style={{ borderColor: teamColorAlpha(manager.userId, 0.25) }}
        >
          {[
            { label: "Record", value: stats.record },
            { label: "Win %", value: `${(stats.winPct * 100).toFixed(0)}%` },
            { label: "Points", value: stats.pointsFor.toFixed(0) },
          ].map((s) => (
            <div
              key={s.label}
              className="px-3 py-3 text-center"
              style={{ borderColor: teamColorAlpha(manager.userId, 0.25) }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{s.label}</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-primary sm:text-lg">
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {stats.trend.length > 1 && (
          <div
            className="relative flex items-center gap-3 border-t px-5 py-3"
            style={{ borderColor: teamColorAlpha(manager.userId, 0.25) }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Career form
            </span>
            <Sparkline values={stats.trend} color={color} width={160} height={28} className="ml-auto" />
          </div>
        )}
      </div>
    </TiltCard>
  );
}
