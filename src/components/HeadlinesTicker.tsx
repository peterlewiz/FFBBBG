import { useCallback, useEffect, useRef, useState } from "react";
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

function ArrowButton({
  side,
  accent,
  onClick,
  disabled,
}: {
  side: "left" | "right";
  accent: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous story" : "Next story"}
      className={`absolute top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border p-2 backdrop-blur transition-opacity sm:flex ${
        side === "left" ? "left-3" : "right-3"
      } ${disabled ? "cursor-default opacity-25" : "opacity-70 hover:opacity-100"}`}
      style={{ borderColor: `${accent}66`, background: "rgba(5,6,11,0.6)", color: accent }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d={side === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}

export function HeadlinesTicker({ headlines }: { headlines: Headline[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  // Two independent reasons to stop auto-advancing: the pointer is resting
  // over the card, or the reader just interacted with it. Kept separate so
  // moving the mouse away can't cut short the post-interaction hold.
  const [hovering, setHovering] = useState(false);
  const [holding, setHolding] = useState(false);
  const paused = hovering || holding;
  const resumeTimer = useRef<number | null>(null);

  const scrollToIndex = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  }, []);

  const holdAutoAdvance = useCallback(() => {
    setHolding(true);
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setHolding(false), 10000);
  }, []);

  // Keep `index` in sync with wherever the reader has scrolled to.
  const indexRef = useRef(0);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!track.clientWidth) return;
        const i = Math.round(track.scrollLeft / track.clientWidth);
        indexRef.current = i;
        setIndex(i);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Slide width is the container width, so a resize (rotating a phone,
  // dragging a window) leaves the scroll offset stranded between snap
  // points - showing two half stories. Re-align on the current story.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!track.clientWidth) return;
      track.scrollTo({ left: indexRef.current * track.clientWidth, behavior: "auto" });
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (headlines.length <= 1 || paused) return;
    const id = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || !track.clientWidth) return;
      const current = Math.round(track.scrollLeft / track.clientWidth);
      const next = (current + 1) % headlines.length;
      track.scrollTo({
        left: next * track.clientWidth,
        // Wrapping back to the start jumps rather than smooth-scrolling in
        // reverse past every story in between.
        behavior: next === 0 ? "auto" : "smooth",
      });
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [headlines.length, paused]);

  useEffect(
    () => () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    },
    [],
  );

  if (headlines.length === 0) return null;

  const safeIndex = Math.min(index, headlines.length - 1);
  const current = headlines[safeIndex];
  const userId = current.manager?.userId;
  const accent = userId ? teamColor(userId) : SITE_NEON;

  function step(delta: number) {
    holdAutoAdvance();
    const next = Math.min(Math.max(safeIndex + delta, 0), headlines.length - 1);
    scrollToIndex(next);
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-surface transition-colors"
      style={{
        borderColor: teamColorAlpha(userId ?? "", 0.35),
        boxShadow: `0 0 40px ${teamColorAlpha(userId ?? "", 0.1)}`,
      }}
      onPointerDown={holdAutoAdvance}
      onWheel={holdAutoAdvance}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/*
       * A real scroll container rather than a swapped-out single card, so
       * it can be swiped on touch and scrolled/arrowed on desktop. Snap
       * points keep it landing cleanly on one story at a time.
       */}
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {headlines.map((h, i) => (
          <div key={h.tag + i} className="w-full shrink-0 snap-center">
            <HeroBanner headline={h} />
            <div className="px-5 py-4">
              <p className="text-lg font-extrabold leading-tight text-primary sm:text-xl">
                {h.text}
              </p>
              <p className="mt-1 text-sm text-muted">{h.subhead}</p>
            </div>
          </div>
        ))}
      </div>

      {headlines.length > 1 && (
        <>
          <ArrowButton
            side="left"
            accent={accent}
            onClick={() => step(-1)}
            disabled={safeIndex === 0}
          />
          <ArrowButton
            side="right"
            accent={accent}
            onClick={() => step(1)}
            disabled={safeIndex === headlines.length - 1}
          />

          <div className="flex items-center justify-center gap-1.5 border-t border-line py-2">
            {headlines.map((h, i) => (
              <button
                key={h.tag + i}
                type="button"
                aria-label={`Show story ${i + 1} of ${headlines.length}`}
                aria-current={i === safeIndex}
                onClick={() => {
                  holdAutoAdvance();
                  scrollToIndex(i);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIndex ? "w-5" : "w-1.5 bg-line hover:bg-muted"
                }`}
                style={
                  i === safeIndex
                    ? { background: accent, boxShadow: `0 0 10px ${accent}` }
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
