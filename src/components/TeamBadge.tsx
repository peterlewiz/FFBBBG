import { teamColor, teamColorAlpha } from "../lib/teamColors";

/**
 * A manager's identity chip: their initial on a glowing disc in their
 * signature neon color. Deliberately not the Sleeper avatar - this is
 * the site's own visual language, and it also keeps the UI working
 * without depending on Sleeper's CDN.
 */
export function TeamBadge({
  userId,
  displayName,
  size = 36,
}: {
  userId: string;
  displayName: string;
  size?: number;
}) {
  const color = teamColor(userId);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        color,
        background: `radial-gradient(circle at 30% 25%, ${teamColorAlpha(userId, 0.35)}, ${teamColorAlpha(userId, 0.08)} 70%)`,
        border: `1px solid ${teamColorAlpha(userId, 0.6)}`,
        boxShadow: `0 0 12px ${teamColorAlpha(userId, 0.35)}, inset 0 0 12px ${teamColorAlpha(userId, 0.15)}`,
        textShadow: `0 0 8px ${teamColorAlpha(userId, 0.8)}`,
      }}
    >
      {initial}
    </span>
  );
}
