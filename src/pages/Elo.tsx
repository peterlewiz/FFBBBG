import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { computeEloRatings, getEloLeaderboard } from "../lib/elo";
import { computeSeasonForm } from "../lib/seasonForm";
import { forecastMatchup } from "../lib/matchupForecast";
import type { PlayerForecast } from "../lib/playerForecast";
import {
  useLineupForecasts,
  type StarterForecast,
  type TeamLineupForecast,
} from "../lib/lineupForecast";
import { winProbability } from "../lib/elo";
import { ROOT_LEAGUE_ID } from "../lib/history";
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

  const {
    byUserId: lineupByUser,
    model,
    updatedAt,
    refreshing,
    refresh,
  } = useLineupForecasts(ROOT_LEAGUE_ID, targetWeek);

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
    if (!data || targetWeek === null || !eloResult) return [];
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
        const lineupA = lineupByUser[userA];
        const lineupB = lineupByUser[userB];
        // Lineups are the larger half of the estimate, so until they've
        // loaded there's nothing to show but an Elo number dressed up as
        // a forecast - better to wait than to publish a different answer
        // for a second.
        if (!lineupA || !lineupB) return null;
        const eloProbA = winProbability(
          eloResult.ratings[userA] ?? 1500,
          eloResult.ratings[userB] ?? 1500,
        );
        return {
          managerA: data.managers[userA],
          managerB: data.managers[userB],
          lineupA,
          lineupB,
          ...forecastMatchup(lineupA.points, lineupB.points, eloProbA, seasonForm.weeklySd),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [data, eloResult, lineupByUser, seasonForm.weeklySd, targetWeek]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  return (
    <div className="flex flex-col gap-6">
      {upcomingMatchups.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold text-primary">
                Win Probability — Week {targetWeek}
              </h2>
              {/* Lineups re-read every minute, but a stale-looking number
                  is only trustworthy if you can see when it was read. */}
              <span className="text-[11px] text-muted">
                {refreshing
                  ? "Checking Sleeper…"
                  : updatedAt
                    ? `Lineups as of ${updatedAt.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : ""}
              </span>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="ml-auto rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-body hover:bg-line disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
            <p className="text-xs text-muted">
              Every starter gets two projections — this site&apos;s own model and
              Sleeper&apos;s — averaged, both scored in this league&apos;s rules, then blended
              with Elo. Tap a matchup for the player-by-player breakdown.
              {model && model.weeksLearned.length > 0
                ? ` Using ${model.weeksLearned.length} week${
                    model.weeksLearned.length === 1 ? "" : "s"
                  } of this season plus last season's form.`
                : " Based on last season's form until this one has games in it."}
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
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Odds</h1>
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
 * One week's matchup as a compact row, expanding on click into the
 * player-by-player projection behind it. Collapsed by default: six open
 * breakdowns is a wall of numbers, and most of the time the question is
 * just "who's favoured".
 */
function MatchupOdds({
  matchup,
}: {
  matchup: {
    managerA: Manager;
    managerB: Manager;
    probA: number;
    pointsA: number;
    pointsB: number;
    lineupA: TeamLineupForecast;
    lineupB: TeamLineupForecast;
  };
}) {
  const [open, setOpen] = useState(false);
  const { managerA, managerB, probA, pointsA, pointsB, lineupA, lineupB } = matchup;
  const pctA = Math.round(probA * 100);
  const colorA = teamColor(managerA.userId);
  const colorB = teamColor(managerB.userId);
  const aFavoured = probA >= 0.5;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 sm:gap-3 sm:px-5"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden sm:block">
            <TeamBadge userId={managerA.userId} displayName={managerA.displayName} size={22} />
          </span>
          <span className="min-w-0">
            <span
              className={`block truncate text-sm ${aFavoured ? "font-semibold" : "text-body"}`}
              style={aFavoured ? { color: colorA } : undefined}
            >
              {managerA.displayName}
            </span>
            <LineupNote lineup={lineupA} points={pointsA} />
          </span>
        </span>

        <span
          className="w-9 shrink-0 text-right text-xs font-bold tabular-nums"
          style={{ color: colorA }}
        >
          {pctA}%
        </span>
        <span className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full sm:w-28">
          <span style={{ width: `${pctA}%`, background: colorA }} />
          <span style={{ width: `${100 - pctA}%`, background: colorB }} />
        </span>
        <span
          className="w-9 shrink-0 text-left text-xs font-bold tabular-nums"
          style={{ color: colorB }}
        >
          {100 - pctA}%
        </span>

        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="min-w-0 text-right">
            <span
              className={`block truncate text-sm ${!aFavoured ? "font-semibold" : "text-body"}`}
              style={!aFavoured ? { color: colorB } : undefined}
            >
              {managerB.displayName}
            </span>
            <LineupNote lineup={lineupB} points={pointsB} align="right" />
          </span>
          <span className="hidden sm:block">
            <TeamBadge userId={managerB.userId} displayName={managerB.displayName} size={22} />
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xs text-muted">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && <MatchupBreakdown lineupA={lineupA} lineupB={lineupB} colorA={colorA} colorB={colorB} />}
    </div>
  );
}

/**
 * The two lineups slot against slot, each player with the points they're
 * projected for. Laid out as one row per slot rather than two separate
 * lists so the comparison people actually make - my RB against theirs -
 * doesn't need scrolling between two columns.
 */
function MatchupBreakdown({
  lineupA,
  lineupB,
  colorA,
  colorB,
}: {
  lineupA: TeamLineupForecast;
  lineupB: TeamLineupForecast;
  colorA: string;
  colorB: string;
}) {
  const rows = lineupA.starters.map((a, i) => ({ a, b: lineupB.starters[i] ?? null, slot: a.slot }));

  return (
    <div className="border-t border-line bg-surface-2/40 px-3 py-2 sm:px-5 sm:py-3">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2 py-1 text-xs">
          <StarterCell starter={row.a} color={colorA} />
          <span className="w-11 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
            {row.slot}
          </span>
          <StarterCell starter={row.b} color={colorB} align="right" />
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2 border-t border-line pt-2 text-xs font-semibold">
        <span className="flex-1 text-right tabular-nums" style={{ color: colorA }}>
          {lineupA.points.toFixed(1)}
        </span>
        <span className="w-11 shrink-0 text-center text-[10px] uppercase tracking-wide text-muted">
          Total
        </span>
        <span className="flex-1 tabular-nums" style={{ color: colorB }}>
          {lineupB.points.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function StarterCell({
  starter,
  color,
  align = "left",
}: {
  starter: StarterForecast | null;
  color: string;
  align?: "left" | "right";
}) {
  const right = align === "right";
  if (!starter || starter.name === null) {
    return (
      <span className={`min-w-0 flex-1 truncate text-amber-400/80 ${right ? "text-right" : ""}`}>
        Empty slot
      </span>
    );
  }
  const f = starter.forecast;
  // A starter who scores nothing this week is the single most useful
  // thing in this table, so the reason is shown instead of a bare 0.0.
  const tag = f?.onBye ? "BYE" : f?.out ? "OUT" : f?.questionable ? "Q" : null;

  // Names to the outside, scores to the inside, so the two columns of
  // numbers sit either side of the slot label and can be compared down
  // the page without reading across a name each time.
  return (
    <span
      className={`flex min-w-0 flex-1 items-baseline gap-1.5 ${right ? "flex-row-reverse" : ""}`}
    >
      <span className={`min-w-0 flex-1 truncate text-body ${right ? "text-right" : ""}`}>
        {starter.name}
      </span>
      {tag && (
        <span
          title={[f?.injuryStatus, f?.injuryBodyPart].filter(Boolean).join(" — ") || undefined}
          className={`shrink-0 text-[9px] font-bold ${
            tag === "Q" ? "text-amber-400/80" : "text-red-400/80"
          }`}
        >
          {tag}
        </span>
      )}
      <span
        className="shrink-0 tabular-nums font-semibold"
        style={{ color }}
        title={f ? sourceBreakdown(f) : undefined}
      >
        {f ? f.points.toFixed(1) : "—"}
      </span>
    </span>
  );
}

/** A team's projected total, plus why it's low when it is. */
function LineupNote({
  lineup,
  points,
  align = "left",
}: {
  lineup: TeamLineupForecast;
  points: number;
  align?: "left" | "right";
}) {
  const reasons: string[] = [];
  if (lineup.onBye > 0) reasons.push(`${lineup.onBye} on bye`);
  if (lineup.out > 0) reasons.push(`${lineup.out} out`);
  if (lineup.emptySlots > 0) reasons.push(`${lineup.emptySlots} empty`);

  return (
    <span
      className={`block truncate text-[11px] tabular-nums text-muted ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {points.toFixed(1)}
      {reasons.length > 0 && <span className="text-amber-400/80"> · {reasons.join(", ")}</span>}
    </span>
  );
}

/** The source numbers behind a player's projection, for the tooltip -
 * worth surfacing because when the two disagree sharply that's usually a
 * player worth a second look before setting a lineup. */
function sourceBreakdown(f: PlayerForecast): string {
  const parts = [
    f.sources.own !== null ? `model ${f.sources.own.toFixed(1)}` : null,
    f.sources.sleeper !== null ? `Sleeper ${f.sources.sleeper.toFixed(1)}` : null,
  ].filter((p): p is string => p !== null);
  const injury = [f.injuryStatus, f.injuryBodyPart].filter(Boolean).join(" — ");
  const suffix = f.onBye
    ? " · on bye"
    : f.out
      ? ` · ${injury || "ruled out"}`
      : f.questionable
        ? ` · ${injury} (model discounted 15%; Sleeper's number already prices it in)`
        : "";
  return parts.join("  ·  ") + suffix;
}
