import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { computeEloRatings, getEloLeaderboard } from "../lib/elo";
import { computeSeasonForm, seasonWinProbability } from "../lib/seasonForm";
import { ScoreTrendChart, type ChartSeries } from "../components/ScoreTrendChart";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import { TeamBadge } from "../components/TeamBadge";
import { PlayoffOddsPanel } from "../components/PlayoffOddsPanel";
import type { Manager } from "../lib/history";
import { Sparkline } from "../components/Sparkline";
import { useNflState } from "../lib/useNflState";

export function Elo() {
  // Playoff odds used to be their own tab; they live here now, behind a
  // toggle, since both views answer "how good is each team right now".
  const [view, setView] = useState<"elo" | "odds">("elo");
  const { data, loading, error } = useLeagueHistory();
  const { state: nflState } = useNflState();
  const targetWeek = nflState?.week ?? null;

  const eloResult = useMemo(() => (data ? computeEloRatings(data) : null), [data]);
  const leaderboard = useMemo(
    () => (data && eloResult ? getEloLeaderboard(data, eloResult) : []),
    [data, eloResult],
  );

  const { chartData, series } = useMemo(() => {
    if (!data || !eloResult || eloResult.history.length === 0) {
      return { chartData: [], series: [] as ChartSeries[] };
    }
    const userIds = Object.keys(data.managers).sort();
    const series: ChartSeries[] = userIds.map((userId) => ({
      key: userId,
      name: data.managers[userId]?.displayName ?? userId,
      color: teamColor(userId),
    }));
    const chartData = eloResult.history.map((snap) => {
      const row: Record<string, number | string> = {
        label: `${snap.season} Wk ${snap.week}`,
      };
      for (const userId of userIds) {
        row[userId] = Math.round(snap.ratings[userId] ?? 1500);
      }
      return row;
    });
    return { chartData, series };
  }, [data, eloResult]);

  // Recent rating history per manager, for the leaderboard sparklines.
  const ratingTrends = useMemo(() => {
    const out: Record<string, number[]> = {};
    if (!eloResult) return out;
    const recent = eloResult.history.slice(-30);
    for (const snap of recent) {
      for (const [userId, rating] of Object.entries(snap.ratings)) {
        (out[userId] ??= []).push(Math.round(rating));
      }
    }
    return out;
  }, [eloResult]);

  // This season's scoring only - no Elo, and nothing carried over from
  // previous seasons.
  const seasonForm = useMemo(
    () => computeSeasonForm(data ? (data.seasons[data.seasons.length - 1] ?? null) : null, targetWeek),
    [data, targetWeek],
  );

  const upcomingMatchups = useMemo(() => {
    if (!data || targetWeek === null) return [];
    const currentSeason = data.seasons[data.seasons.length - 1];
    if (!currentSeason || currentSeason.weeks.length === 0) return [];

    const rosterToUser = new Map(
      currentSeason.rosters
        .filter((r) => r.ownerUserId)
        .map((r) => [r.rosterId, r.ownerUserId as string]),
    );
    const weekRows = currentSeason.weeks.filter((w) => w.week === targetWeek);
    const byMatchup = new Map<number, typeof weekRows>();
    for (const row of weekRows) {
      if (row.matchupId === null) continue;
      const arr = byMatchup.get(row.matchupId) ?? [];
      arr.push(row);
      byMatchup.set(row.matchupId, arr);
    }

    return Array.from(byMatchup.values())
      .filter((pair) => pair.length === 2)
      .map((pair) => {
        const [a, b] = pair;
        const userA = rosterToUser.get(a.rosterId);
        const userB = rosterToUser.get(b.rosterId);
        if (!userA || !userB) return null;
        const formA = seasonForm.byUserId[userA];
        const formB = seasonForm.byUserId[userB];
        // Nothing played yet this season means nothing to base a
        // probability on - better to show no section than a coin flip
        // dressed up as analysis.
        if (!formA || !formB) return null;
        return {
          managerA: data.managers[userA],
          managerB: data.managers[userB],
          probA: seasonWinProbability(formA.meanPoints, formB.meanPoints, seasonForm.weeklySd),
          meanA: formA.meanPoints,
          meanB: formB.meanPoints,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [data, seasonForm, targetWeek]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  return (
    <div className="flex flex-col gap-6">
      {upcomingMatchups.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-primary">
              Win Probability — Week {targetWeek}
            </h2>
            <p className="text-xs text-muted">
              From this season&apos;s scoring only ({seasonForm.weeksCounted.length}{" "}
              {seasonForm.weeksCounted.length === 1 ? "week" : "weeks"} played
              {seasonForm.sdMeasured ? "" : ", spread assumed until there's more to measure"}).
              Independent of Elo and of previous seasons.
            </p>
          </div>
          <div className="divide-y divide-line">
            {upcomingMatchups.map((m, i) => (
              <MatchupOdds key={i} matchup={m} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView("elo")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
            view === "elo" ? "bg-neon text-ink" : "bg-surface-2 text-body hover:bg-line"
          }`}
        >
          Elo Ratings
        </button>
        <button
          type="button"
          onClick={() => setView("odds")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
            view === "odds" ? "bg-neon text-ink" : "bg-surface-2 text-body hover:bg-line"
          }`}
        >
          Playoff Odds
        </button>
      </div>

      {view === "odds" ? (
        <PlayoffOddsPanel />
      ) : (
        <>
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Elo</h1>
        <p className="mt-1 text-sm text-muted">
          A simple Elo rating built from every historical matchup — higher rating means a
          manager has consistently beaten good teams by good margins. See the{" "}
          <Link to="/predictions" className="font-medium text-neon hover:underline">
            Predictions
          </Link>{" "}
          tab to make your own picks for the week.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface shadow-sm">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-primary">Elo Leaderboard</h2>
        </div>
        <ol className="divide-y divide-line">
          {leaderboard.map((entry, i) => {
            const color = teamColor(entry.manager.userId);
            return (
              <li key={entry.manager.userId}>
                <Link
                  to={`/manager/${entry.manager.userId}`}
                  className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:gap-4 sm:px-5"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{
                      background: color,
                      boxShadow: `0 0 10px ${teamColorAlpha(entry.manager.userId, 0.7)}`,
                    }}
                  />
                  <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted">
                    {i + 1}
                  </span>
                  <TeamBadge
                    userId={entry.manager.userId}
                    displayName={entry.manager.displayName}
                    size={32}
                  />
                  <span className="flex-1 truncate text-sm font-medium text-primary">
                    {entry.manager.displayName}
                  </span>
                  <Sparkline
                    values={ratingTrends[entry.manager.userId] ?? []}
                    color={color}
                    width={72}
                    height={22}
                    className="hidden shrink-0 sm:block"
                  />
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold"
                    style={{
                      color,
                      background: teamColorAlpha(entry.manager.userId, 0.12),
                      border: `1px solid ${teamColorAlpha(entry.manager.userId, 0.35)}`,
                    }}
                  >
                    {entry.rating}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-primary">
            Rating over time
          </h2>
          <ScoreTrendChart data={chartData} series={series} xKey="label" yLabel="Elo rating" />
        </div>
      )}
        </>
      )}
    </div>
  );
}

/**
 * One week's matchup as a single compact row: both teams either side of a
 * split bar showing the Elo win probability. Replaced the full-width
 * FightCard here - six of those made the page a wall of avatars and
 * gradients when all you want is to scan the week's odds.
 */
function MatchupOdds({
  matchup,
}: {
  matchup: { managerA: Manager; managerB: Manager; probA: number };
}) {
  const { managerA, managerB, probA } = matchup;
  const pctA = Math.round(probA * 100);
  const colorA = teamColor(managerA.userId);
  const colorB = teamColor(managerB.userId);
  const aFavoured = probA >= 0.5;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-5">
      <Link
        to={`/manager/${managerA.userId}`}
        className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
      >
        <span className="hidden sm:block">
          <TeamBadge userId={managerA.userId} displayName={managerA.displayName} size={22} />
        </span>
        <span
          className={`truncate text-sm ${aFavoured ? "font-semibold" : "text-body"}`}
          style={aFavoured ? { color: colorA } : undefined}
        >
          {managerA.displayName}
        </span>
      </Link>

      <span
        className="w-9 shrink-0 text-right text-xs font-bold tabular-nums"
        style={{ color: colorA }}
      >
        {pctA}%
      </span>
      <div className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full sm:w-28">
        <div style={{ width: `${pctA}%`, background: colorA }} />
        <div style={{ width: `${100 - pctA}%`, background: colorB }} />
      </div>
      <span
        className="w-9 shrink-0 text-left text-xs font-bold tabular-nums"
        style={{ color: colorB }}
      >
        {100 - pctA}%
      </span>

      <Link
        to={`/manager/${managerB.userId}`}
        className="flex min-w-0 flex-1 items-center justify-end gap-2 hover:underline"
      >
        <span
          className={`truncate text-right text-sm ${!aFavoured ? "font-semibold" : "text-body"}`}
          style={!aFavoured ? { color: colorB } : undefined}
        >
          {managerB.displayName}
        </span>
        <span className="hidden sm:block">
          <TeamBadge userId={managerB.userId} displayName={managerB.displayName} size={22} />
        </span>
      </Link>
    </div>
  );
}
