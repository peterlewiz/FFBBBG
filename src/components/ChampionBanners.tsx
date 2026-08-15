import { Link } from "react-router-dom";
import type { ChampionEntry } from "../lib/champions";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import { TeamBadge } from "./TeamBadge";

/**
 * Past champions as rafter banners. Oldest on the left, newest on the
 * right, each hanging from a rail in that manager's neon color.
 */
export function ChampionBanners({ champions }: { champions: ChampionEntry[] }) {
  if (champions.length === 0) return null;
  const oldestFirst = [...champions].reverse();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-primary">Championship Banners</h2>
        <p className="text-xs text-muted">Every title in league history</p>
      </div>

      <div className="relative px-4 pb-6 pt-0">
        {/* the rail they hang from */}
        <div
          aria-hidden
          className="absolute inset-x-4 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, #2b3654, transparent)" }}
        />

        <div className="flex items-start gap-2 overflow-x-auto pb-1 pt-0 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden">
          {oldestFirst.map((c) => {
            const userId = c.champion?.userId;
            const color = userId ? teamColor(userId) : "#00e5ff";
            const glow = userId ? teamColorAlpha(userId, 0.35) : "rgba(0,229,255,0.35)";
            return (
              <Link
                key={c.season}
                to={userId ? `/manager/${userId}` : "#"}
                className="group flex w-[5.5rem] shrink-0 flex-col items-center transition-transform hover:-translate-y-0 sm:w-24"
                title={`${c.season} — ${c.champion?.displayName ?? "Unknown"}`}
              >
                {/* hanger */}
                <span aria-hidden className="h-3 w-px" style={{ background: color }} />

                {/*
                 * Banner: rectangle with a notched bottom via clip-path.
                 * Fixed height so every banner matches - the optional
                 * platform label would otherwise make pre-Sleeper seasons
                 * taller than the rest.
                 */}
                <div
                  className="relative flex h-36 w-full flex-col items-center gap-1 px-2 pb-7 pt-3 transition-shadow"
                  style={{
                    background: `linear-gradient(180deg, ${teamColorAlpha(userId ?? "", 0.35)}, ${teamColorAlpha(userId ?? "", 0.08)})`,
                    border: `1px solid ${color}`,
                    borderBottom: "none",
                    clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%)",
                    boxShadow: `0 0 22px ${glow}`,
                  }}
                >
                  {userId ? (
                    <span className="relative">
                      <TeamBadge
                        userId={userId}
                        displayName={c.champion?.displayName ?? "?"}
                        size={40}
                      />
                      {/* trophy pip, so the banner still reads as a title */}
                      <span className="absolute -bottom-1 -right-1 text-[11px] leading-none drop-shadow">
                        🏆
                      </span>
                    </span>
                  ) : (
                    <span className="text-xl leading-none">🏆</span>
                  )}
                  <span
                    className="mt-0.5 text-[11px] font-black tabular-nums leading-none"
                    style={{ color }}
                  >
                    {c.season}
                  </span>
                  <span className="w-full truncate text-center text-[10px] font-semibold leading-tight text-primary">
                    {c.champion?.displayName ?? "Unknown"}
                  </span>
                  {c.platform && (
                    <span className="text-[8px] uppercase tracking-wider text-muted">
                      {c.platform}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
