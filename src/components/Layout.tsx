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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="text-xl">🏈</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">
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
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-400 sm:px-6">
        Data from{" "}
        <a
          href="https://sleeper.com"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-slate-500"
        >
          Sleeper
        </a>
        . Not affiliated with Sleeper.
      </footer>
    </div>
  );
}
