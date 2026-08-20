import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { trackPageView } from "../lib/ga";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoadingScreen } from "./StatusScreen";

const navItems = [
  { to: "/", label: "Home", end: true },
  { to: "/predictions", label: "Predictions" },
  { to: "/playoff-odds", label: "Playoff Odds" },
  { to: "/history", label: "History" },
  { to: "/graphs", label: "Graphs" },
  { to: "/elo", label: "Elo" },
];

/** Readable page name for GA, from the same labels the nav bar uses. */
function pageTitleFor(pathname: string): string {
  const match = navItems.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  );
  if (match) return match.label;
  if (pathname.startsWith("/manager/")) return "Manager Detail";
  return pathname;
}

const FALLBACK_NAME = "Bears Beats Battlestar Galactica";

/** The league's own logo from Sleeper, falling back to 🏈 if it can't load. */
function LeagueLogo({ avatar }: { avatar: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!avatar || failed) {
    return <span className="text-xl">🏈</span>;
  }
  return (
    <img
      src={`https://sleepercdn.com/avatars/${avatar}`}
      alt=""
      onError={() => setFailed(true)}
      className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-line"
    />
  );
}

export function Layout() {
  // Cached by useLeagueHistory, so this doesn't cost an extra fetch.
  const { data } = useLeagueHistory();
  const location = useLocation();

  // GA's automatic page_view is disabled (see index.html) since this is an
  // SPA - fire one ourselves on every route change, including the first,
  // so "top pages" and per-page engagement time reflect actual tab usage.
  useEffect(() => {
    trackPageView(location.pathname, pageTitleFor(location.pathname));
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-ink">
      {/*
       * Two rows on phones (title, then a scrollable nav) collapsing to a
       * single row from `sm` up. Five nav items plus the league name do not
       * fit on a 375px viewport in one row - that combination was pushing
       * the whole page into horizontal scroll.
       */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          <NavLink to="/" className="flex min-w-0 items-center gap-2.5">
            <LeagueLogo avatar={data?.leagueAvatar ?? null} />
            <span className="truncate text-sm font-semibold text-primary sm:text-base">
              {data?.leagueName || FALLBACK_NAME}
            </span>
          </NavLink>
          <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? "bg-neon/10 text-neon" : "text-body hover:bg-surface-2"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
        {/*
         * Keyed by path so the boundary resets when the reader navigates -
         * otherwise one crashed page would keep showing its error on every
         * route afterwards. Suspense covers the lazy-loaded page chunks.
         */}
        <ErrorBoundary key={location.pathname}>
          {/* page-enter is keyed too, so it replays the fade on each route change */}
          <div key={location.pathname} className="page-enter flex flex-1 flex-col">
            <Suspense fallback={<LoadingScreen label="Loading…" />}>
              <Outlet />
            </Suspense>
          </div>
        </ErrorBoundary>
      </main>
      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-muted sm:px-6">
        Data from{" "}
        <a
          href="https://sleeper.com"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-body"
        >
          Sleeper
        </a>
        . Not affiliated with Sleeper.
      </footer>
    </div>
  );
}
