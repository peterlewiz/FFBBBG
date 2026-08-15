import { useMemo, useState } from "react";
import type { LeagueHistory } from "../lib/history";
import { computeHeadToHead } from "../lib/headToHead";
import { FightCard } from "./FightCard";

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
    <div className="rounded-2xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-primary">Head-to-Head</h2>
        <p className="text-xs text-muted">
          Pick two managers to see every matchup between them
        </p>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <select
          value={userIdA}
          onChange={(e) => setUserIdA(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary"
        >
          <option value="">Select manager A</option>
          {managers.map((m) => (
            <option key={m.userId} value={m.userId} disabled={m.userId === userIdB}>
              {m.displayName}
            </option>
          ))}
        </select>
        <span className="shrink-0 text-center text-xs font-semibold uppercase text-muted">
          vs
        </span>
        <select
          value={userIdB}
          onChange={(e) => setUserIdB(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary"
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
            <p className="border-t border-line px-5 py-4 text-sm text-muted">
              {managerA.displayName} and {managerB.displayName} haven&apos;t played each other yet.
            </p>
          ) : (
            <>
              <div className="border-t border-line">
                <FightCard
                  centerLabel="All-time"
                  centerValue={`${result.winsA}–${result.winsB}${result.ties ? ` (${result.ties}T)` : ""}`}
                  left={{
                    manager: managerA,
                    headline: String(result.winsA),
                    winner: result.winsA > result.winsB,
                    stats: [
                      { label: "PTS", value: result.totalPointsA.toFixed(0) },
                      { label: "AVG", value: (result.totalPointsA / result.games.length).toFixed(1) },
                    ],
                  }}
                  right={{
                    manager: managerB,
                    headline: String(result.winsB),
                    winner: result.winsB > result.winsA,
                    stats: [
                      { label: "PTS", value: result.totalPointsB.toFixed(0) },
                      { label: "AVG", value: (result.totalPointsB / result.games.length).toFixed(1) },
                    ],
                  }}
                  footer={
                    <p className="text-center text-xs text-muted">
                      {result.games.length} meeting{result.games.length === 1 ? "" : "s"} since{" "}
                      {result.games[0].season}
                    </p>
                  }
                />
              </div>

              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[30rem] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium sm:px-4">Season</th>
                      <th className="px-3 py-2 font-medium sm:px-4">Wk</th>
                      <th className="px-3 py-2 font-medium sm:px-4">{managerA.displayName}</th>
                      <th className="px-3 py-2 font-medium sm:px-4">{managerB.displayName}</th>
                      <th className="px-3 py-2 font-medium sm:px-4">Winner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
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
                            <td className="px-3 py-2 text-body sm:px-4">{g.season}</td>
                            <td className="px-3 py-2 text-body sm:px-4">{g.week}</td>
                            <td
                              className={`whitespace-nowrap px-3 py-2 sm:px-4 ${g.pointsA > g.pointsB ? "font-semibold text-primary" : "text-body"}`}
                            >
                              {g.pointsA.toFixed(1)}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-2 sm:px-4 ${g.pointsB > g.pointsA ? "font-semibold text-primary" : "text-body"}`}
                            >
                              {g.pointsB.toFixed(1)}
                            </td>
                            <td className="px-3 py-2 text-body sm:px-4">{winner}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
