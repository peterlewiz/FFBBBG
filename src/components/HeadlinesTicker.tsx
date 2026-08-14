import { useEffect, useState } from "react";
import type { Headline } from "../lib/headlines";

const ROTATE_MS = 7000;

function avatarSrc(avatar: string | null | undefined): string {
  return avatar
    ? `https://sleepercdn.com/avatars/thumbs/${avatar}`
    : "https://sleepercdn.com/images/v2/icons/player_default.webp";
}

// Distinct gradient treatment per storyline type, ESPN-graphics-package style.
const GRADIENTS: Record<string, string> = {
  "DRAFT DAY": "from-slate-700 via-slate-800 to-slate-950",
  "TITLE DEFENSE": "from-amber-500 via-amber-600 to-yellow-800",
  "HEATING UP": "from-orange-500 via-red-600 to-red-800",
  "SKID WATCH": "from-sky-700 via-slate-800 to-slate-950",
  "STILL WAITING": "from-violet-600 via-purple-700 to-indigo-900",
  "NEW BLOOD": "from-emerald-500 via-teal-600 to-teal-800",
  "TOP DOG": "from-yellow-600 via-amber-700 to-neutral-900",
};
const DEFAULT_GRADIENT = "from-slate-700 via-slate-800 to-slate-950";

export function HeadlinesTicker({ headlines }: { headlines: Headline[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (headlines.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % headlines.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [headlines.length]);

  if (headlines.length === 0) return null;

  const current = headlines[index % headlines.length];
  const gradient = GRADIENTS[current.tag] ?? DEFAULT_GRADIENT;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Hero banner */}
      <div
        key={index}
        className={`relative aspect-[21/9] w-full animate-[fadein_0.4s_ease] overflow-hidden bg-gradient-to-br sm:aspect-[21/6] ${gradient}`}
      >
        {/* Subtle texture: giant translucent football glyphs scattered in the background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none text-9xl font-black leading-none text-white/5"
          style={{ WebkitTextStroke: "1px rgba(255,255,255,0.06)" }}
        >
          <span className="absolute -left-6 -top-10 rotate-[-12deg]">🏈</span>
          <span className="absolute -right-10 bottom-[-3.5rem] rotate-[10deg]">🏈</span>
        </div>

        {/* BREAKING ribbon */}
        <div className="absolute left-0 top-0 flex items-center gap-1.5 bg-red-600 px-3 py-1.5 shadow">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-white">
            Breaking
          </span>
        </div>

        {/* Tag badge */}
        <div className="absolute right-3 top-3 rounded-full bg-black/30 px-3 py-1 backdrop-blur-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white">
            {current.tag}
          </span>
        </div>

        {/* Avatar hero */}
        <div className="flex h-full items-center justify-center">
          {current.avatar !== undefined ? (
            <img
              src={avatarSrc(current.avatar)}
              alt=""
              className="h-24 w-24 rounded-full border-4 border-white/80 object-cover shadow-xl sm:h-32 sm:w-32"
            />
          ) : (
            <span className="text-6xl drop-shadow-lg sm:text-7xl">🏈</span>
          )}
        </div>
      </div>

      {/* Headline + subhead */}
      <div className="px-5 py-4">
        <p className="text-lg font-extrabold leading-tight text-slate-900 dark:text-white sm:text-xl">
          {current.text}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{current.subhead}</p>
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
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
