import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LeagueHistory } from "../lib/history";
import { computeHeadToHead } from "../lib/headToHead";

export function HeadToHeadPanel({ history }: { history: LeagueHistory }) {
  const managers = useMemo(
    () => Object.values(history.managers).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [history],
  );

  const [userIdA, setUserIdA] = useState<string>("");
  const [userIdB, setUserIdB] = useState<string>("");

  const managerA = userIdA ? history.managers[userIdA] : null;
  const managerB = userIdB ? history.managers[userIdB] : null;

  const result = useMemo(() => {
    if (!userIdA || !userIdB || userIdA === userIdB) return null;
    return computeHeadToHead(history, userIdA, userIdB);
  }, [history, userIdA, userIdB]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Head-to-Head</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pick two managers to see every matchup between them
        </p>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <select
          value={userIdA}
          onChange={(e) => setUserIdA(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">Select manager A</option>
          {managers.map((m) => (
            <option key={m.userId} value={m.userId} disabled={m.userId === userIdB}>
              {m.displayName}
            </option>
          ))}
        </select>
        <span className="shrink-0 text-center text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
          vs
        </span>
        <select
          value={userIdB}
          onChange={(e) => setUserIdB(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">Select manager B</option>
          {managers.map((m) => (
            <option key={m.userId} value={m.userId} disabled={m.userId === userIdA}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>

      {managerA && managerB && result && (
        <>
          {result.games.length === 0 ? (
            <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {managerA.displayName} and {managerB.displayName} haven&apos;t played each other yet.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                <div className="bg-white px-5 py-4 text-center dark:bg-slate-900">
                  <Link
                    to={`/manager/${managerA.userId}`}
                    className="text-sm font-semibold text-slate-900 hover:underline dark:text-white"
                  >
                    {managerA.displayName}
                  </Link>
                  <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {result.winsA}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {result.totalPointsA.toFixed(1)} pts
                  </p>
                </div>
                <div className="bg-white px-5 py-4 text-center dark:bg-slate-900">
                  <Link
                    to={`/manager/${managerB.userId}`}
                    className="text-sm font-semibold text-slate-900 hover:underline dark:text-white"
                  >
                    {managerB.displayName}
                  </Link>
                  <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {result.winsB}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {result.totalPointsB.toFixed(1)} pts
                  </p>
                </div>
              </div>
              {result.ties > 0 && (
                <p className="border-t border-slate-100 px-5 py-2 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  {result.ties} tie{result.ties === 1 ? "" : "s"}
                </p>
              )}

              <table className="w-full border-t border-slate-100 text-left text-sm dark:border-slate-800">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Season</th>
                    <th className="px-4 py-2 font-medium">Week</th>
                    <th className="px-4 py-2 font-medium">{managerA.displayName}</th>
                    <th className="px-4 py-2 font-medium">{managerB.displayName}</th>
                    <th className="px-4 py-2 font-medium">Winner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {result.games
                    .slice()
                    .reverse()
                    .map((g, i) => {
                      const winner =
                        g.pointsA > g.pointsB
                          ? managerA.displayName
                          : g.pointsB > g.pointsA
                            ? managerB.displayName
                            : "Tie";
                      return (
                        <tr key={i}>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{g.season}</td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{g.week}</td>
                          <td
                            className={`px-4 py-2 ${g.pointsA > g.pointsB ? "font-semibold text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}
                          >
                            {g.pointsA.toFixed(1)}
                          </td>
                          <td
                            className={`px-4 py-2 ${g.pointsB > g.pointsA ? "font-semibold text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}
                          >
                            {g.pointsB.toFixed(1)}
                          </td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{winner}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
