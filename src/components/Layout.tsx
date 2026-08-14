import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home", end: true },
  { to: "/history", label: "History" },
  { to: "/graphs", label: "Graphs" },
  { to: "/elo", label: "Elo" },
  { to: "/predictions", label: "Predictions" },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="text-xl">🏈</span>
            <span className="text-sm font-semibold text-primary sm:text-base">
              Bears Beats Battlestar Galactica
            </span>
          </NavLink>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-neon/10 text-neon"
                      : "text-body hover:bg-surface-2"
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
          className="underline hover:text-muted"
        >
          Sleeper
        </a>
        . Not affiliated with Sleeper.
      </footer>
    </div>
  );
}
