import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion } from "../lib/motion";

export interface SectionTab {
  label: string;
  /** id of the element the tab jumps to. */
  target: string;
  /** Runs before scrolling - e.g. flipping a toggle so the section shows
   * what the tab names. */
  onSelect?: () => void;
  /** Whether this tab is lit when `inView` is the section on screen.
   * Defaults to matching `target`; two tabs sharing one section (a toggle
   * showing one view or the other) use this to tell which view is up. */
  isActive?: (inView: string | null) => boolean;
}

/**
 * Jump links for a long page, pinned just below the site header.
 *
 * The longest pages stack several sections, and the one people check most
 * can sit at the bottom - the prediction leaderboard is two and a half
 * screens down. The tab for whichever section is on screen stays lit as
 * you scroll, so the bar doubles as a "you are here".
 */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const barRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  // Nothing is lit until a section has actually been reached - lighting
  // the first tab on arrival read as though it had been chosen.
  const [inView, setInView] = useState<string | null>(null);

  // The header's height changes - the score strip appears once scores
  // load, and it's hidden on phones - so it's measured, not assumed.
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setHeaderHeight(header.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  /** Where a section's top should land: just clear of header and bar.
   * The header is measured live rather than read from state: state lags
   * whenever the header changes size between observer callbacks (the logo
   * loading in, the score strip appearing), and a lagging value put the
   * section a few pixels under the bar. */
  const landingLine = () =>
    (document.querySelector("header")?.getBoundingClientRect().height ?? headerHeight) +
    (barRef.current?.offsetHeight ?? 0) +
    12;

  const targetsKey = tabs.map((t) => t.target).join("|");
  useEffect(() => {
    const targets = [...new Set(targetsKey.split("|"))];
    function update() {
      const line = landingLine();
      let current: string | null = null;
      for (const id of targets) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - line <= 1) current = id;
      }
      // The last section can be too short to ever reach the line, so at
      // the bottom of the page it wins - but only once you've scrolled,
      // or a page that fits on one screen would light its last tab.
      const atBottom =
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) current = targets[targets.length - 1] ?? current;
      setInView(current);
    }
    // Straight on the scroll event, not deferred to an animation frame:
    // browsers already fire scroll at most once a frame, and the work is a
    // handful of measurements.
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // landingLine reads headerHeight, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsKey, headerHeight]);

  function go(tab: SectionTab) {
    // Applied synchronously, so a toggle flipped by onSelect has rendered
    // before the section is measured. Waiting for an animation frame
    // instead meant a tap did nothing in a backgrounded tab, where
    // browsers stop delivering frames.
    flushSync(() => {
      tab.onSelect?.();
      setInView(tab.target);
    });
    const el = document.getElementById(tab.target);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - landingLine(),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  return (
    <nav
      ref={barRef}
      aria-label={label}
      // Bleeds to the edges of the page's padding so content scrolling
      // underneath is covered edge to edge.
      // z-[15]: above anything a page pins inside itself (the Past Picks
      // table's name column is z-10, and was drawing over the bar), below
      // the site header at z-20.
      className="sticky z-[15] -mx-4 border-b border-line bg-ink/90 px-4 backdrop-blur sm:-mx-6 sm:px-6"
      style={{ top: headerHeight }}
    >
      <div className="flex gap-1 py-1.5 sm:gap-1.5">
        {tabs.map((tab) => {
          const active = tab.isActive ? tab.isActive(inView) : inView === tab.target;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => go(tab)}
              aria-current={active ? "location" : undefined}
              // Same pill as the main nav's current page. The focus ring is
              // keyboard-only: on a click it drew a box around the tab that
              // read as a second, different kind of highlight.
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/60 sm:px-3 sm:text-sm ${
                active ? "bg-neon/10 text-neon" : "text-muted hover:bg-surface-2 hover:text-body"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
