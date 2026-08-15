import { Link } from "react-router-dom";
import type { ChampionEntry } from "../lib/champions";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import { TeamBadge } from "./TeamBadge";

const TROPHY_SRC = "/trophy.webp";

/**
 * The league's actual trophy, lit in the reigning champion's neon color
 * so it ties into the rest of the site.
 */
function TrophyHero({ reigning }: { reigning: ChampionEntry }) {
  const userId = reigning.champion?.userId;
  const glow = userId ? teamColorAlpha(userId, 0.45) : "rgba(0,229,255,0.45)";

  return (
    <div className="relative flex flex-col items-center gap-3 border-b border-line px-5 pb-5 pt-2">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: glow }}
      />
      <img
        src={TROPHY_SRC}
        alt="The league championship trophy"
        loading="lazy"
        className="relative h-44 w-auto object-contain sm:h-52"
        style={{ filter: `drop-shadow(0 12px 24px ${glow})` }}
      />
      {reigning.champion && (
        <div className="relative text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Reigning champion
          </p>
          <Link
            to={`/manager/${reigning.champion.userId}`}
            className="mt-1 inline-flex items-center gap-2 hover:underline"
            style={{ color: teamColor(reigning.champion.userId) }}
          >
            <TeamBadge
              userId={reigning.champion.userId}
              displayName={reigning.champion.displayName}
              size={22}
            />
            <span className="text-base font-bold">{reigning.champion.displayName}</span>
          </Link>
          <p className="mt-0.5 text-xs text-muted">{reigning.season} champion</p>
        </div>
      )}
    </div>
  );
}

export function PastChampionsPanel({ champions }: { champions: ChampionEntry[] }) {
  const reigning = champions[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-primary">Past Champions</h2>
      </div>

      {reigning && <TrophyHero reigning={reigning} />}

      {champions.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">No completed seasons yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {champions.map((c) => (
            <li key={c.season}>
              <Link
                to={c.champion ? `/manager/${c.champion.userId}` : "#"}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="w-12 shrink-0 text-sm font-semibold text-muted">{c.season}</span>
                <span className="text-lg">🏆</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-primary">
                    {c.champion?.displayName ?? "Unknown"}
                  </p>
                  {c.runnerUp ? (
                    <p className="truncate text-xs text-muted">beat {c.runnerUp.displayName}</p>
                  ) : (
                    c.platform && <p className="truncate text-xs text-muted">on {c.platform}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
