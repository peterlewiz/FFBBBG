import { useEffect, useState } from "react";
import type { Headline } from "../lib/headlines";
import { useCustomManagerImage } from "../lib/managerImage";
import { teamColor, teamColorAlpha } from "../lib/teamColors";

const ROTATE_MS = 7000;
const SITE_NEON = "#00e5ff"; // used for headlines not about a specific manager

function HeroBanner({ headline }: { headline: Headline }) {
  const userId = headline.manager?.userId;
  const accent = userId ? teamColor(userId) : SITE_NEON;
  const glow = userId ? teamColorAlpha(userId, 0.35) : "rgba(0, 229, 255, 0.35)";
  const customImage = useCustomManagerImage(userId ?? "");

  return (
    <div
      className="relative aspect-[21/9] w-full overflow-hidden bg-ink sm:aspect-[21/6]"
      style={{ boxShadow: `inset 0 0 120px ${teamColorAlpha(userId ?? "", 0.12)}` }}
    >
      {customImage ? (
        <img src={customImage} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          {/* Neon grid floor + glow, no photo yet */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(${teamColorAlpha(userId ?? "", 0.12)} 1px, transparent 1px),
                linear-gradient(90deg, ${teamColorAlpha(userId ?? "", 0.12)} 1px, transparent 1px)`,
              backgroundSize: "44px 44px",
              maskImage: "linear-gradient(to top, black, transparent 75%)",
            }}
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: glow }}
          />
          <div className="relative flex h-full items-center justify-center">
            <span
              className="text-6xl sm:text-7xl"
              style={{ filter: `drop-shadow(0 0 18px ${accent})` }}
            >
              🏈
            </span>
          </div>
        </>
      )}

      {/* Scanline sheen over the whole banner, ties photo and placeholder together */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)",
        }}
      />
      {/* Bottom fade so the headline text below reads as one unit with the art */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
        style={{ background: "linear-gradient(to top, #0c0e16, transparent)" }}
      />

      {/* BREAKING ribbon */}
      <div
        className="absolute left-0 top-0 flex items-center gap-1.5 px-3 py-1.5"
        style={{ background: accent, boxShadow: `0 0 24px ${glow}` }}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink">
          Breaking
        </span>
      </div>

      {/* Tag badge */}
      <div
        className="absolute right-3 top-3 rounded-full border px-3 py-1 backdrop-blur-sm"
        style={{
          borderColor: teamColorAlpha(userId ?? "", 0.5),
          background: "rgba(5, 6, 11, 0.55)",
        }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: accent }}
        >
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
  const userId = current.manager?.userId;
  const accent = userId ? teamColor(userId) : SITE_NEON;

  return (
    <div
      className="overflow-hidden rounded-2xl border bg-surface"
      style={{
        borderColor: teamColorAlpha(userId ?? "", 0.35),
        boxShadow: `0 0 40px ${teamColorAlpha(userId ?? "", 0.1)}`,
      }}
    >
      <div key={index} className="animate-[fadein_0.4s_ease]">
        <HeroBanner headline={current} />
      </div>

      <div className="px-5 py-4">
        <p className="text-lg font-extrabold leading-tight text-primary sm:text-xl">
          {current.text}
        </p>
        <p className="mt-1 text-sm text-muted">{current.subhead}</p>
      </div>

      {headlines.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 border-t border-line py-2">
          {headlines.map((h, i) => (
            <button
              key={h.tag + i}
              type="button"
              aria-label={`Show headline ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5" : "w-1.5 bg-line hover:bg-muted"}`}
              style={
                i === index
                  ? { background: accent, boxShadow: `0 0 10px ${accent}` }
                  : undefined
              }
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
