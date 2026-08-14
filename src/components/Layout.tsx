import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";

const navItems = [
  { to: "/", label: "Home", end: true },
  { to: "/history", label: "History" },
  { to: "/graphs", label: "Graphs" },
  { to: "/elo", label: "Elo" },
  { to: "/predictions", label: "Predictions" },
];

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
        <Outlet />
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
