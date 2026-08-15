/**
 * Rank movement against the previous season. Ranks are "lower is better",
 * so a drop in rank number is an improvement.
 */
export function RankDelta({ previous, current }: { previous: number | null; current: number }) {
  if (previous === null) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted" title="First season">
        new
      </span>
    );
  }

  const delta = previous - current;
  if (delta === 0) {
    return (
      <span className="text-[11px] text-muted" title="Same as last season">
        —
      </span>
    );
  }

  const up = delta > 0;
  return (
    <span
      className="text-[11px] font-semibold tabular-nums"
      style={{ color: up ? "#00ff9c" : "#ff5a3c" }}
      title={`${up ? "Up" : "Down"} ${Math.abs(delta)} from last season`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}
