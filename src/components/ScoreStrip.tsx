import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { useNflState } from "../lib/useNflState";
import { ROOT_LEAGUE_ID, type Manager } from "../lib/history";
import { teamColor } from "../lib/teamColors";
import { useScoreStrip, type StripStatus, type StripTeam } from "../lib/useScoreStrip";

const STATUS_LABEL: Record<StripStatus, string> = {
  pre: "Upcoming",
  live: "Live",
  underway: "In progress",
  final: "Final",
};

/**
 * Every matchup in the current week, across the top of every page - the
 * ESPN-style ticker. Live scores are what people check during games, so
 * they're wherever someone lands instead of one click away on Scores.
 * Each matchup links through to Scores for the lineups.
 *
 * Desktop only: phones have the bottom tab bar, and the header there is
 * deliberately just the league name.
 */
export function ScoreStrip() {
  const { data } = useLeagueHistory();
  const { state: nflState } = useNflState();
  const week = nflState?.week ?? null;
  const { matchups, status } = useScoreStrip(ROOT_LEAGUE_ID, week);

  // Nothing to show until there's a week and its matchups - an empty bar
  // across the top would just look broken.
  if (week === null || matchups.length === 0 || status === null) return null;
  const managers = data?.managers ?? {};

  return (
    <section
      aria-label={`Week ${week} scores`}
      className="hidden items-stretch gap-1.5 md:flex"
    >
      <div className="flex w-20 shrink-0 flex-col justify-center">
        <span className="text-[11px] font-semibold text-primary">Week {week}</span>
        <span
          className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${
            status === "live" ? "text-emerald-400" : "text-muted"
          }`}
        >
          {status === "live" && (
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          )}
          {STATUS_LABEL[status]}
        </span>
      </div>
      {matchups.map((m) => {
        const started = m.a.points > 0 || m.b.points > 0;
        return (
          <Link
            key={m.matchupId}
            to="/scores"
            // Shrinks to share the row rather than scrolling sideways: a
            // hidden horizontal scroll is how the old phone nav hid tabs.
            className="flex min-w-0 max-w-[150px] flex-1 flex-col justify-center gap-0.5 rounded-lg border border-line bg-surface-2/50 px-2 py-1 transition-colors hover:bg-surface-2"
          >
            <TeamLine team={m.a} managers={managers} leading={started && m.a.points > m.b.points} />
            <TeamLine team={m.b} managers={managers} leading={started && m.b.points > m.a.points} />
          </Link>
        );
      })}
    </section>
  );
}

function TeamLine({
  team,
  managers,
  leading,
}: {
  team: StripTeam;
  managers: Record<string, Manager>;
  leading: boolean;
}) {
  const name = team.ownerUserId ? managers[team.ownerUserId]?.displayName : undefined;
  return (
    <span className="flex items-baseline gap-1.5 text-[11px] leading-tight">
      <span
        className={`min-w-0 flex-1 truncate ${leading ? "font-semibold" : "text-muted"}`}
        style={leading && team.ownerUserId ? { color: teamColor(team.ownerUserId) } : undefined}
      >
        {name ?? "—"}
      </span>
      <span className={`shrink-0 tabular-nums ${leading ? "font-semibold text-primary" : "text-muted"}`}>
        {team.points.toFixed(1)}
      </span>
    </span>
  );
}
