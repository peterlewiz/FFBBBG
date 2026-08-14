import { useEffect, useState } from "react";
import type { Headline } from "../lib/headlines";

const ROTATE_MS = 6000;

function avatarSrc(avatar: string | null | undefined): string {
  return avatar
    ? `https://sleepercdn.com/avatars/thumbs/${avatar}`
    : "https://sleepercdn.com/images/v2/icons/player_default.webp";
}

export function HeadlinesTicker({ headlines }: { headlines: Headline[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (headlines.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % headlines.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [headlines.length]);

  if (headlines.length === 0) return null;

  const current = headlines[index % headlines.length];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-stretch">
        <div className="flex shrink-0 items-center bg-red-600 px-4 py-3">
          <span className="text-xs font-extrabold uppercase tracking-wide text-white">
            {current.tag}
          </span>
        </div>
        <div key={index} className="flex flex-1 items-center gap-3 animate-[fadein_0.4s_ease] px-4 py-3">
          {current.avatar !== undefined && (
            <img
              src={avatarSrc(current.avatar)}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full bg-slate-100 object-cover dark:bg-slate-800"
            />
          )}
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{current.text}</p>
        </div>
      </div>
      {headlines.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-2 dark:border-slate-800">
          {headlines.map((h, i) => (
            <button
              key={h.tag + i}
              type="button"
              aria-label={`Show headline ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? "w-5 bg-red-600"
                  : "w-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600"
              }`}
            />
          ))}
        </div>
      )}
      <style>{`
        @keyframes fadein {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
