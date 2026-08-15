import { useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "../lib/motion";

const MAX_TILT_DEG = 6;

/**
 * Tilts toward the cursor with a neon sheen following it. Pointer-driven
 * only - no state, so it doesn't re-render on every mouse move.
 */
export function TiltCard({
  children,
  accent = "#00e5ff",
  className = "",
}: {
  children: ReactNode;
  accent?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateY(${(px - 0.5) * 2 * MAX_TILT_DEG}deg) rotateX(${(0.5 - py) * 2 * MAX_TILT_DEG}deg)`;
    el.style.setProperty("--sheen-x", `${px * 100}%`);
    el.style.setProperty("--sheen-y", `${py * 100}%`);
  }

  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={`relative transition-transform duration-200 ease-out will-change-transform ${className}`}
      style={
        {
          "--sheen-x": "50%",
          "--sheen-y": "0%",
        } as React.CSSProperties
      }
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200 hover:opacity-100"
        style={{
          background: `radial-gradient(400px circle at var(--sheen-x) var(--sheen-y), ${accent}22, transparent 60%)`,
        }}
      />
    </div>
  );
}
