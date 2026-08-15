import { Link } from "react-router-dom";
import type { Manager } from "../lib/history";
import { teamColor, teamColorAlpha } from "../lib/teamColors";

export interface FighterStat {
  label: string;
  value: string;
}

export interface Fighter {
  manager: Manager;
  /** Big number under the name - win count, points, whatever fits. */
  headline?: string;
  stats?: FighterStat[];
  /** Renders a subtle winner glow on this side. */
  winner?: boolean;
}

function avatarSrc(userId: string) {
  return `/manager-avatars/${userId}.png`;
}

function Side({
  fighter,
  align,
}: {
  fighter: Fighter;
  align: "left" | "right";
}) {
  const { manager } = fighter;
  const color = teamColor(manager.userId);
  const isLeft = align === "left";

  return (
    <div
      className={`relative flex flex-1 flex-col items-center gap-2 px-3 py-5 sm:px-6 ${
        isLeft ? "sm:items-start" : "sm:items-end"
      }`}
    >
      {/* team-color wash behind each fighter */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at ${isLeft ? "0%" : "100%"} 50%, ${teamColorAlpha(
            manager.userId,
            fighter.winner ? 0.3 : 0.18,
          )}, transparent 70%)`,
        }}
      />

      <Link
        to={`/manager/${manager.userId}`}
        className="relative flex flex-col items-center gap-2 sm:items-stretch"
      >
        <img
          src={avatarSrc(manager.userId)}
          alt=""
          className="h-20 w-20 rounded-full object-cover sm:h-24 sm:w-24"
          style={{
            border: `2px solid ${color}`,
            boxShadow: `0 0 26px ${teamColorAlpha(manager.userId, 0.55)}`,
          }}
        />
        <p
          className={`max-w-[9rem] truncate text-center text-sm font-extrabold sm:max-w-[11rem] sm:text-base ${
            isLeft ? "sm:text-left" : "sm:text-right"
          }`}
          style={{ color, textShadow: `0 0 18px ${teamColorAlpha(manager.userId, 0.6)}` }}
        >
          {manager.displayName}
        </p>
      </Link>

      {fighter.headline && (
        <p
          className="relative text-3xl font-black tabular-nums text-primary sm:text-4xl"
          style={{ textShadow: `0 0 22px ${teamColorAlpha(manager.userId, 0.5)}` }}
        >
          {fighter.headline}
        </p>
      )}

      {fighter.stats && fighter.stats.length > 0 && (
        <dl
          className={`relative flex flex-col gap-0.5 text-center text-[11px] text-muted ${
            isLeft ? "sm:text-left" : "sm:text-right"
          }`}
        >
          {fighter.stats.map((s) => (
            <div key={s.label} className="flex items-baseline justify-center gap-1.5 sm:justify-start">
              <dt className="uppercase tracking-wide">{s.label}</dt>
              <dd className="font-semibold text-body">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * Head-to-head matchup as a fight poster: both managers facing off, their
 * neon colors meeting at a diagonal seam down the middle.
 */
export function FightCard({
  left,
  right,
  centerLabel,
  centerValue,
  footer,
}: {
  left: Fighter;
  right: Fighter;
  /** Small label above the centre, e.g. "ALL-TIME" or "WIN PROBABILITY". */
  centerLabel?: string;
  /** Centre readout, e.g. "5–5" or "62% – 38%". */
  centerValue?: string;
  footer?: React.ReactNode;
}) {
  const leftColor = teamColor(left.manager.userId);
  const rightColor = teamColor(right.manager.userId);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-ink">
      {/* diagonal seam where the two colors meet */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
        style={{
          background: `linear-gradient(180deg, transparent, ${leftColor}, ${rightColor}, transparent)`,
          boxShadow: `0 0 24px ${leftColor}66`,
        }}
      />

      <div className="flex items-stretch">
        <Side fighter={left} align="left" />

        <div className="relative z-10 flex shrink-0 flex-col items-center justify-center gap-1 px-2 sm:px-4">
          {centerLabel && (
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
              {centerLabel}
            </span>
          )}
          <span
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-black uppercase tracking-widest text-primary sm:text-sm"
            style={{ boxShadow: `0 0 30px ${leftColor}33, 0 0 30px ${rightColor}33` }}
          >
            VS
          </span>
          {centerValue && (
            <span className="whitespace-nowrap text-sm font-bold tabular-nums text-body sm:text-base">
              {centerValue}
            </span>
          )}
        </div>

        <Side fighter={right} align="right" />
      </div>

      {footer && <div className="relative border-t border-line px-5 py-3">{footer}</div>}
    </div>
  );
}
