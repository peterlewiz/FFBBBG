import { useMemo } from "react";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { computeAllTimePowerRankings } from "../lib/powerRankings";
import { getChampionHistory } from "../lib/champions";
import { PowerRankingsWidget } from "../components/PowerRankingsWidget";
import { PastChampionsPanel } from "../components/PastChampionsPanel";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";

export function Home() {
  const { data, loading, error } = useLeagueHistory();

  const powerRankings = useMemo(() => (data ? computeAllTimePowerRankings(data) : []), [data]);
  const champions = useMemo(() => (data ? getChampionHistory(data) : []), [data]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  const latestSeason = data.seasons[data.seasons.length - 1];
  const seasonNotStarted =
    latestSeason && (latestSeason.status === "pre_draft" || latestSeason.status === "drafting");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
          League Home
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {data.seasons[0]?.season}–{latestSeason?.season} · {Object.keys(data.managers).length}{" "}
          managers
        </p>
      </div>

      {seasonNotStarted && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          The {latestSeason.season} season hasn&apos;t started yet — rankings below reflect
          all completed seasons so far.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PowerRankingsWidget entries={powerRankings} />
        </div>
        <div className="lg:col-span-1">
          <PastChampionsPanel champions={champions} />
        </div>
      </div>
    </div>
  );
}
