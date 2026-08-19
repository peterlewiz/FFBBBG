import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { HeadToHeadPanel } from "../components/HeadToHeadPanel";
import { TeamBadge } from "../components/TeamBadge";
import { RankDelta } from "../components/RankDelta";
import { LEGACY_SEASONS } from "../lib/legacySeasons";

export function History() {
  const { data, loading, error } = useLeagueHistory();

  const completedSeasons = useMemo(
    () => (data ? data.seasons.filter((s) => s.rosters.length > 0).slice().reverse() : []),
    [data],
  );

  // Pre-Sleeper seasons we have standings for (e.g. 2020, played on ESPN),
  // appended after the Sleeper seasons - oldest last, same as the button row.
  const legacySeasons = useMemo(
    () =>
      data
        ? LEGACY_SEASONS.filter(
            (l) => l.standings && !data.seasons.some((s) => s.season === l.season),
          )
        : [],
    [data],
  );

  const [selected, setSelected] = useState<string | null>(null);
  // A selected legacy season wins outright - only fall back to the
  // default Sleeper season when nothing (or nothing matching) is picked.
  const activeLegacySeason = legacySeasons.find((l) => l.season === selected);
  const activeSeason = activeLegacySeason
    ? undefined
    : (completedSeasons.find((s) => s.season === selected) ?? completedSeasons[0]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  if (!activeSeason && !activeLegacySeason) {
    return (
      <p className="text-sm text-muted">
        No season data available yet.
      </p>
    );
  }

  if (activeLegacySeason) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">
            Season History
          </h1>
          <p className="mt-1 text-sm text-muted">
            Final standings for each season, plus all-time head-to-head records.
          </p>
        </div>

        <HeadToHeadPanel history={data} />

        <div className="flex flex-wrap gap-2">
          {completedSeasons.map((s) => (
            <button
              key={s.season}
              onClick={() => setSelected(s.season)}
              className="rounded-full bg-surface px-3 py-1.5 text-sm font-medium text-body ring-1 ring-line transition-colors hover:bg-surface"
            >
              {s.season}
            </button>
          ))}
          {legacySeasons.map((l) => (
            <button
              key={l.season}
              onClick={() => setSelected(l.season)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                l.season === activeLegacySeason.season
                  ? "bg-neon text-ink"
                  : "bg-surface text-body ring-1 ring-line hover:bg-surface"
              }`}
            >
              {l.season}
              <span className="ml-1 opacity-70">({l.platform})</span>
            </button>
          ))}
        </div>

        {/* Scrolls inside its own card on narrow screens instead of widening the page. */}
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[24rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3 font-medium sm:px-4">#</th>
                <th className="px-3 py-3 font-medium sm:px-4">Manager</th>
                <th className="px-3 py-3 font-medium sm:px-4">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {activeLegacySeason.standings!.map((row) => {
                const manager = row.userId ? data.managers[row.userId] : undefined;
                const name = manager?.displayName ?? row.name ?? "Unknown";
                const isChampion = activeLegacySeason.championUserId === row.userId;
                return (
                  <tr key={row.rank}>
                    <td className="whitespace-nowrap px-3 py-3 text-muted sm:px-4">{row.rank}</td>
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex items-center gap-2">
                        {manager ? (
                          <TeamBadge userId={manager.userId} displayName={name} size={22} />
                        ) : (
                          <span
                            aria-hidden
                            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-muted"
                          >
                            {name.charAt(0)}
                          </span>
                        )}
                        {manager ? (
                          <Link
                            to={`/manager/${manager.userId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {isChampion && <span className="mr-1">🏆</span>}
                            {name}
                          </Link>
                        ) : (
                          <span className="font-medium text-primary">
                            {isChampion && <span className="mr-1">🏆</span>}
                            {name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-body sm:px-4">
                      {row.wins}-{row.losses}
                      {row.ties > 0 ? `-${row.ties}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Both early-return branches above cover the only cases where this
  // isn't set, so it's guaranteed defined here.
  const season = activeSeason!;

  const standings = season.rosters
    .filter((r) => r.ownerUserId && data.managers[r.ownerUserId])
    .map((r) => {
      const games = r.wins + r.losses + r.ties;
      return {
        manager: data.managers[r.ownerUserId as string],
        rosterId: r.rosterId,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        pointsFor: r.pointsFor,
        pointsAgainst: r.pointsAgainst,
        winPct: games > 0 ? (r.wins + r.ties * 0.5) / games : 0,
        isChampion: season.championRosterId === r.rosterId,
      };
    })
    .sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor);

  // Where each manager finished the season before, so the table can show
  // movement. Same ordering rule, so the comparison is like-for-like.
  //
  // Only meaningful once the season being viewed has actually been played:
  // in an unplayed season everyone sits at 0-0 and the ordering is
  // arbitrary, which produced confident-looking nonsense like "up 10".
  const activeSeasonPlayed = season.weeks.length > 0;
  const previousSeason = data.seasons.find(
    (s) => Number(s.season) === Number(season.season) - 1,
  );
  const previousRanks = new Map<string, number>();
  if (activeSeasonPlayed && previousSeason) {
    previousSeason.rosters
      .filter((r) => r.ownerUserId)
      .map((r) => {
        const games = r.wins + r.losses + r.ties;
        return {
          userId: r.ownerUserId as string,
          winPct: games > 0 ? (r.wins + r.ties * 0.5) / games : 0,
          pointsFor: r.pointsFor,
        };
      })
      .sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor)
      .forEach((row, i) => previousRanks.set(row.userId, i + 1));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          Season History
        </h1>
        <p className="mt-1 text-sm text-muted">
          Final standings for each season, plus all-time head-to-head records.
        </p>
      </div>

      <HeadToHeadPanel history={data} />

      <div className="flex flex-wrap gap-2">
        {completedSeasons.map((s) => (
          <button
            key={s.season}
            onClick={() => setSelected(s.season)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              s.season === season.season
                ? "bg-neon text-ink"
                : "bg-surface text-body ring-1 ring-line hover:bg-surface"
            }`}
          >
            {s.season}
            {s.status !== "complete" && (
              <span className="ml-1 opacity-70">
                ({s.status === "pre_draft" ? "upcoming" : "in progress"})
              </span>
            )}
          </button>
        ))}
        {legacySeasons.map((l) => (
          <button
            key={l.season}
            onClick={() => setSelected(l.season)}
            className="rounded-full bg-surface px-3 py-1.5 text-sm font-medium text-body ring-1 ring-line transition-colors hover:bg-surface"
          >
            {l.season}
            <span className="ml-1 opacity-70">({l.platform})</span>
          </button>
        ))}
      </div>

      {/* Scrolls inside its own card on narrow screens instead of widening the page. */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-3 font-medium sm:px-4">#</th>
              <th className="px-3 py-3 font-medium sm:px-4">Manager</th>
              <th className="px-3 py-3 font-medium sm:px-4">Record</th>
              <th className="px-3 py-3 font-medium sm:px-4">PF</th>
              <th className="px-3 py-3 font-medium sm:px-4">PA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {standings.map((row, i) => {
              const seasonTeamName =
                row.manager.teamNameBySeason[season.season] ?? row.manager.teamName;
              return (
                <tr key={row.rosterId}>
                  <td className="whitespace-nowrap px-3 py-3 text-muted sm:px-4">
                    <span className="mr-1.5">{i + 1}</span>
                    {activeSeasonPlayed && previousRanks.size > 0 && (
                      <RankDelta
                        previous={previousRanks.get(row.manager.userId) ?? null}
                        current={i + 1}
                      />
                    )}
                  </td>
                  <td className="px-3 py-3 sm:px-4">
                    <div className="flex items-center gap-2">
                      <TeamBadge
                        userId={row.manager.userId}
                        displayName={row.manager.displayName}
                        size={22}
                      />
                      <div className="min-w-0">
                        <Link
                          to={`/manager/${row.manager.userId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.isChampion && <span className="mr-1">🏆</span>}
                          {row.manager.displayName}
                        </Link>
                        {seasonTeamName !== row.manager.displayName && (
                          <p className="truncate text-xs text-muted">{seasonTeamName}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-body sm:px-4">
                    {row.wins}-{row.losses}
                    {row.ties > 0 ? `-${row.ties}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-body sm:px-4">
                    {row.pointsFor.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-body sm:px-4">
                    {row.pointsAgainst.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
