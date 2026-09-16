import { useLeagueHistory } from "../lib/useLeagueHistory";
import { useNflState } from "../lib/useNflState";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { ShadyRankings } from "../components/ShadyRankings";
import { ROOT_LEAGUE_ID } from "../lib/history";

export function ShadyCorner() {
  const { data: history, loading, error } = useLeagueHistory();
  const { state: nflState } = useNflState();

  if (loading) return <LoadingScreen />;
  if (error || !history) return <ErrorScreen message={error ?? "Unknown error"} />;

  const latestSeason = history.seasons[history.seasons.length - 1];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Shady&apos;s Corner</h1>
        <p className="mt-1 text-sm text-muted">Hand-made power rankings, posted after each week.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        {/* Rankings describe a week that's finished, so they target the
            week before the NFL's current one - while week 2 is being
            played, you're ranking week 1. Clamped at 1 so the very start
            of a season doesn't aim at week 0. */}
        <ShadyRankings
          leagueId={ROOT_LEAGUE_ID}
          season={latestSeason?.season ?? ""}
          week={nflState ? Math.max(1, nflState.week - 1) : null}
          managers={
            // Only this season's teams - history.managers spans every
            // season, so it still carries managers who've since left.
            latestSeason
              ? latestSeason.rosters
                  .map((r) => (r.ownerUserId ? history.managers[r.ownerUserId] : null))
                  .filter((m): m is NonNullable<typeof m> => !!m)
              : []
          }
        />
      </div>
    </div>
  );
}
