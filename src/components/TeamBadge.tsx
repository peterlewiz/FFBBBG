import { useState } from "react";
import { teamColor, teamColorAlpha } from "../lib/teamColors";

/**
 * A manager's profile picture, ringed and glowing in their signature neon
 * color. Falls back to their initial on a colored disc if no picture
 * exists for them yet (or it fails to load), so this is safe to use for
 * any manager. Pictures live in public/manager-avatars/<userId>.png.
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
  const [failed, setFailed] = useState(false);
  const color = teamColor(userId);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  const frame = {
    width: size,
    height: size,
    border: `1px solid ${teamColorAlpha(userId, 0.6)}`,
    boxShadow: `0 0 12px ${teamColorAlpha(userId, 0.35)}`,
  } as const;

  if (failed) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
        style={{
          ...frame,
          fontSize: size * 0.42,
          color,
          background: `radial-gradient(circle at 30% 25%, ${teamColorAlpha(userId, 0.35)}, ${teamColorAlpha(userId, 0.08)} 70%)`,
          textShadow: `0 0 8px ${teamColorAlpha(userId, 0.8)}`,
        }}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={`/manager-avatars/${userId}.png`}
      alt=""
      onError={() => setFailed(true)}
      className="inline-block shrink-0 rounded-full object-cover"
      style={{ ...frame, background: teamColorAlpha(userId, 0.1) }}
    />
  );
}
