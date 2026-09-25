import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

/**
 * Phone navigation: a tab bar pinned to the bottom of the screen.
 *
 * Replaces the top nav below the `md` breakpoint. That nav scrolled
 * sideways with its scrollbar hidden, so on a phone the last tabs sat off
 * the edge of the screen with nothing to say they existed - and most of
 * this site's traffic is someone tapping a link in the league chat on
 * their phone. Down here every destination is visible and in thumb reach,
 * the way the Sleeper and ESPN apps already work.
 */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const HomeIcon = () => (
  <Icon>
    <path d="M5 12H3l9-9 9 9h-2" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    <path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6" />
  </Icon>
);
const ScoresIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M12 5v2M12 10v1M12 14v1M12 18v1" />
    <path d="M7 3v2M17 3v2" />
  </Icon>
);
const PicksIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="9" />
  </Icon>
);
const OddsIcon = () => (
  <Icon>
    <path d="M4 19h16" />
    <path d="M4 15l4-6 4 2 4-5 4 4" />
  </Icon>
);
const MoreIcon = () => (
  <Icon>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
);

const TABS = [
  { to: "/", label: "Home", end: true, icon: <HomeIcon /> },
  { to: "/scores", label: "Scores", icon: <ScoresIcon /> },
  // "Picks" rather than "Predictions": five labels have to share 375px,
  // and it's what everyone calls it anyway.
  { to: "/predictions", label: "Picks", icon: <PicksIcon /> },
  { to: "/odds", label: "Odds", icon: <OddsIcon /> },
];

/** Behind "More" - visited less often than the four tabs above. */
const MORE = [
  { to: "/shady-corner", label: "Shady's Corner" },
  { to: "/history", label: "History" },
];

const TAB_BASE =
  "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors";

export function BottomNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // "More" lights up when you're on one of the pages inside it, so the bar
  // always shows where you are.
  const inMore = MORE.some((item) => location.pathname.startsWith(item.to));

  // Close on navigation - including via the menu itself.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close on a tap outside or on Escape, handing focus back to the button
  // so keyboard users don't lose their place.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    menuRef.current?.querySelector("a")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <nav
      aria-label="Main"
      // Padded by the safe-area inset so the bar clears the home indicator
      // on phones that have one (zero everywhere else).
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {open && (
        <div
          ref={menuRef}
          id="bottom-nav-more"
          className="absolute bottom-full right-2 mb-2 w-48 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          {MORE.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-4 py-3 text-sm font-medium ${
                  isActive ? "bg-neon/10 text-neon" : "text-body hover:bg-surface-2"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}

      <div className="flex">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `${TAB_BASE} ${isActive ? "text-neon" : "text-muted hover:text-body"}`
            }
          >
            {tab.icon}
            {tab.label}
          </NavLink>
        ))}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="bottom-nav-more"
          className={`${TAB_BASE} ${open || inMore ? "text-neon" : "text-muted hover:text-body"}`}
        >
          <MoreIcon />
          More
        </button>
      </div>
    </nav>
  );
}
