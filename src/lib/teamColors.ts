/**
 * One signature neon color per manager, used everywhere they appear -
 * power rankings, charts, head-to-head, headlines, and their generated
 * hero image. Keyed by Sleeper user_id so a manager keeps their color
 * across seasons even when their team name changes.
 */

/** Hand-picked so no two current managers read as the same hue on dark. */
const ASSIGNED: Record<string, string> = {
  "737330429740363776": "#00E5FF", // Youssefgirges - cyan
  "739228718886711296": "#FF2BD6", // MarioM26     - magenta
  "740737264774217728": "#A3FF12", // maryghaly    - lime
  "976317587141287936": "#FF7A1A", // sharo733     - orange
  "732791680197054464": "#9D4EFF", // mmasoud2     - violet
  "978857538626084864": "#00FF9C", // Enasif18     - spring green
  "738510505450283008": "#FF1E6F", // plewiz       - hot pink
  "739598324197392384": "#2E8BFF", // KokoM        - electric blue
  "853720333243482112": "#FFE81A", // mavs97       - yellow
  "872210229440487424": "#00FFD1", // SumoFlakes   - turquoise
  "739228047332548608": "#FF3B3B", // frtheo       - red
  "738538726719930368": "#6C5CFF", // 3mojt        - indigo
};

/** Fallback pool for anyone not in ASSIGNED (e.g. managers who've left). */
const FALLBACK = [
  "#00E5FF",
  "#FF2BD6",
  "#A3FF12",
  "#FF7A1A",
  "#9D4EFF",
  "#00FF9C",
  "#FF1E6F",
  "#2E8BFF",
  "#FFE81A",
  "#00FFD1",
  "#FF3B3B",
  "#6C5CFF",
];

export function teamColor(userId: string): string {
  const assigned = ASSIGNED[userId];
  if (assigned) return assigned;
  // Stable hash so an unlisted manager still gets a consistent color.
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return FALLBACK[hash % FALLBACK.length];
}

/** `rgba()` form of a team color, for glows and translucent fills. */
export function teamColorAlpha(userId: string, alpha: number): string {
  const hex = teamColor(userId).replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
