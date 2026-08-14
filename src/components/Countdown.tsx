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

export function Countdown({ target, label }: { target: Date; label: string }) {
  const [remaining, setRemaining] = useState(() => getRemaining(target));

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (remaining.done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {label} is here! 🏈
        </p>
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
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-4">
        {units.map(([value, unit]) => (
          <div key={unit} className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {value}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
