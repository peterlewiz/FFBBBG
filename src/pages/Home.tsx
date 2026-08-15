import { useMemo } from "react";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { computeAllTimePowerRankings } from "../lib/powerRankings";
import { getChampionHistory } from "../lib/champions";
import { generateHeadlines } from "../lib/headlines";
import { PowerRankingsWidget } from "../components/PowerRankingsWidget";
import { PastChampionsPanel } from "../components/PastChampionsPanel";
import { ChampionBanners } from "../components/ChampionBanners";
import { SackoPanel } from "../components/SackoPanel";
import { Podium } from "../components/Podium";
import { Countdown } from "../components/Countdown";
import { HeadlinesTicker } from "../components/HeadlinesTicker";
import { Reveal } from "../components/Reveal";
import { SkeletonHome } from "../components/Skeleton";
import { ErrorScreen } from "../components/StatusScreen";
import { resolveDraftDate } from "../lib/constants";

export function Home() {
  const { data, loading, error } = useLeagueHistory();

  const powerRankings = useMemo(() => (data ? computeAllTimePowerRankings(data) : []), [data]);
  const champions = useMemo(() => (data ? getChampionHistory(data) : []), [data]);
  const headlines = useMemo(() => (data ? generateHeadlines(data) : []), [data]);

  if (loading) return <SkeletonHome />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;

  const latestSeason = data.seasons[data.seasons.length - 1];
  const seasonNotStarted =
    latestSeason && (latestSeason.status === "pre_draft" || latestSeason.status === "drafting");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">League Home</h1>
          <p className="mt-1 text-sm text-muted">
            {data.seasons[0]?.season}–{latestSeason?.season} ·{" "}
            {Object.keys(data.managers).length} managers
          </p>
        </div>
        {seasonNotStarted && (
          <div className="w-full sm:w-auto">
            <Countdown target={resolveDraftDate(data.draftStartTime)} label="Draft Day" />
          </div>
        )}
      </div>

      {seasonNotStarted && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          The {latestSeason.season} season hasn&apos;t started yet — rankings below reflect all
          completed seasons so far.
        </div>
      )}

      <HeadlinesTicker headlines={headlines} />

      <Reveal>
        <Podium entries={powerRankings} />
      </Reveal>

      <Reveal delay={60}>
        <ChampionBanners champions={champions} />
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <PowerRankingsWidget entries={powerRankings} />
        </Reveal>
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Reveal delay={60}>
            <PastChampionsPanel champions={champions} />
          </Reveal>
          <Reveal delay={120}>
            <SackoPanel history={data} />
          </Reveal>
        </div>
      </div>
    </div>
  );
}
