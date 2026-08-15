import { useEffect, useRef, useState } from "react";

/** Honour the OS "reduce motion" setting for every animation here. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts a number up when it first scrolls into view. Returns a ref to
 * attach and the value to render.
 */
export function useCountUp<T extends HTMLElement = HTMLSpanElement>(
  target: number,
  durationMs = 900,
  decimals = 0,
) {
  const ref = useRef<T | null>(null);
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const started = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / durationMs, 1);
          // ease-out cubic, so it decelerates into the final number
          const eased = 1 - Math.pow(1 - t, 3);
          setValue(target * eased);
          if (t < 1) requestAnimationFrame(tick);
          else setValue(target);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, durationMs]);

  return { ref, display: value.toFixed(decimals) };
}

/** Adds `is-revealed` the first time the element scrolls into view. */
export function useReveal<T extends HTMLElement>(delayMs = 0) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.opacity = "1";
      return;
    }
    el.style.opacity = "0";

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        el.style.animationDelay = `${delayMs}ms`;
        el.style.opacity = "";
        el.classList.add("is-revealed");
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delayMs]);

  return ref;
}
