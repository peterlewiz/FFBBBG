import { useEffect, useState } from "react";

function getRemaining(target: Date) {
  const diffMs = target.getTime() - Date.now();
  const clamped = Math.max(diffMs, 0);
  const totalSeconds = Math.floor(clamped / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: diffMs <= 0,
  };
}

/**
 * Formats in the *viewer's* local timezone with the zone abbreviation
 * shown, so a manager in another timezone sees their own correct local
 * time rather than being silently told Central.
 */
function formatTarget(target: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(target);
}

export function Countdown({ target, label }: { target: Date; label: string }) {
  const [remaining, setRemaining] = useState(() => getRemaining(target));

  useEffect(() => {
    setRemaining(getRemaining(target));
    const id = setInterval(() => setRemaining(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (remaining.done) {
    return (
      <div className="rounded-2xl border border-neon/30 bg-neon/10 px-5 py-4 text-center">
        <p className="text-sm font-semibold text-neon">{label} is here! 🏈</p>
      </div>
    );
  }

  const units: [number, string][] = [
    [remaining.days, "days"],
    [remaining.hours, "hrs"],
    [remaining.minutes, "min"],
    [remaining.seconds, "sec"],
  ];

  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 flex items-baseline gap-4">
        {units.map(([value, unit]) => (
          <div key={unit} className="flex items-baseline gap-1">
            <span
              className="text-2xl font-bold tabular-nums text-neon"
              style={{ textShadow: "0 0 16px rgba(0,229,255,0.5)" }}
            >
              {value}
            </span>
            <span className="text-xs text-muted">{unit}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{formatTarget(target)}</p>
    </div>
  );
}
