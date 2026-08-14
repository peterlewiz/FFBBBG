import { useEffect, useState } from "react";
import type { Headline } from "../lib/headlines";
import { sleeperAvatarUrl, useCustomManagerImage } from "../lib/managerImage";

const ROTATE_MS = 7000;

// Distinct gradient treatment per storyline type, ESPN-graphics-package style.
// Used as the placeholder background until a real custom image is provided
// for that headline's manager.
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

function HeroBanner({ headline }: { headline: Headline }) {
  const gradient = GRADIENTS[headline.tag] ?? DEFAULT_GRADIENT;
  // Only probes for a real uploaded image when this headline is about someone -
  // the hook itself no-ops safely if userId is "".
  const customImage = useCustomManagerImage(headline.manager?.userId ?? "");

  return (
    <div
      className={`relative aspect-[21/9] w-full overflow-hidden sm:aspect-[21/6] ${
        customImage ? "bg-slate-900" : `bg-gradient-to-br ${gradient}`
      }`}
    >
      {customImage ? (
        // Real image provided for this manager: full-bleed, ESPN-article style.
        <img src={customImage} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          {/* Placeholder texture until a real image exists for this manager */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 select-none text-9xl font-black leading-none text-white/5"
          >
            <span className="absolute -left-6 -top-10 rotate-[-12deg]">🏈</span>
            <span className="absolute -right-10 bottom-[-3.5rem] rotate-[10deg]">🏈</span>
          </div>
          <div className="flex h-full items-center justify-center">
            {headline.manager ? (
              <img
                src={sleeperAvatarUrl(headline.manager.avatar)}
                alt=""
                className="h-24 w-24 rounded-full border-4 border-white/80 object-cover shadow-xl sm:h-32 sm:w-32"
              />
            ) : (
              <span className="text-6xl drop-shadow-lg sm:text-7xl">🏈</span>
            )}
          </div>
        </>
      )}

      {/* BREAKING ribbon */}
      <div className="absolute left-0 top-0 flex items-center gap-1.5 bg-red-600 px-3 py-1.5 shadow">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-white">
          Breaking
        </span>
      </div>

      {/* Tag badge */}
      <div className="absolute right-3 top-3 rounded-full bg-black/40 px-3 py-1 backdrop-blur-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white">
          {headline.tag}
        </span>
      </div>
    </div>
  );
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
      <div key={index} className="animate-[fadein_0.4s_ease]">
        <HeroBanner headline={current} />
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
