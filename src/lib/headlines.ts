import type { LeagueHistory, Manager } from "./history";
import { getChampionHistory } from "./champions";
import { computeAllTimePowerRankings } from "./powerRankings";
import { computeCurrentStreaks } from "./streaks";
import { DRAFT_DATE } from "./constants";

export interface Headline {
  tag: string; // short label, e.g. "DRAFT DAY", "STREAK WATCH"
  text: string;
  /** Shorter secondary line, ESPN-subhead style. */
  subhead: string;
  /** Sleeper avatar id for the manager this headline is about, if any. */
  avatar?: string | null;
}

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Managers with a roster in the current (most recent) season - i.e. still in the league. */
function getActiveManagerIds(history: LeagueHistory): Set<string> {
  const latestSeason = history.seasons[history.seasons.length - 1];
  return new Set(
    (latestSeason?.rosters ?? []).map((r) => r.ownerUserId).filter((id): id is string => !!id),
  );
}

/** Managers whose only appearance in the league history is the current season. */
function getNewcomerIds(history: LeagueHistory, activeIds: Set<string>): Set<string> {
  const latestSeason = history.seasons[history.seasons.length - 1];
  const seenBefore = new Set<string>();
  for (const season of history.seasons) {
    if (season === latestSeason) continue;
    for (const r of season.rosters) {
      if (r.ownerUserId) seenBefore.add(r.ownerUserId);
    }
  }
  return new Set([...activeIds].filter((id) => !seenBefore.has(id)));
}

/**
 * ESPN-style rotating storylines generated from real league data: draft
 * countdown, a title-defense narrative, hot/cold streaks, championship
 * droughts, a newcomer spotlight, and the current all-time #1. Only
 * current league members (managers with a roster in the latest season)
 * are eligible - anyone who's left the league is excluded. Each manager
 * is the subject of at most one headline (whichever qualifies first, in
 * priority order) so nobody dominates the rotation. Anything that can't
 * be computed meaningfully (e.g. no active streak) is left out.
 */
export function generateHeadlines(history: LeagueHistory): Headline[] {
  const headlines: Headline[] = [];
  const activeIds = getActiveManagerIds(history);
  const isActive = (m: Manager) => activeIds.has(m.userId);
  const usedUserIds = new Set<string>();

  function pushFor(manager: Manager, headline: Omit<Headline, "avatar">) {
    if (usedUserIds.has(manager.userId)) return;
    usedUserIds.add(manager.userId);
    headlines.push({ ...headline, avatar: manager.avatar });
  }

  // 1. Draft countdown (not about a specific manager)
  const latestSeason = history.seasons[history.seasons.length - 1];
  if (latestSeason?.status === "pre_draft" || latestSeason?.status === "drafting") {
    const days = daysUntil(DRAFT_DATE);
    headlines.push(
      days > 0
        ? {
            tag: "DRAFT DAY",
            text: `Draft day is ${days} day${days === 1 ? "" : "s"} away.`,
            subhead: "Who's building this year's champion?",
          }
        : {
            tag: "DRAFT DAY",
            text: "Draft day is here.",
            subhead: "Good luck.",
          },
    );
  }

  // 2. Title defense narrative - the one and only headline about the champion.
  const champions = getChampionHistory(history).filter((c) => c.champion && isActive(c.champion));
  if (champions.length > 0 && champions[0].champion) {
    const reigning = champions[0].champion;
    let streakTitles = 0;
    for (const c of champions) {
      if (c.champion?.userId === reigning.userId) streakTitles++;
      else break;
    }
    const nextSeason = Number(champions[0].season) + 1;
    if (streakTitles >= 2) {
      pushFor(reigning, {
        tag: "TITLE DEFENSE",
        text: `${reigning.displayName} is chasing a ${ordinal(streakTitles + 1)} straight title in ${nextSeason}.`,
        subhead: "Can anyone stop the run?",
      });
    } else {
      pushFor(reigning, {
        tag: "TITLE DEFENSE",
        text: `${reigning.displayName} enters ${nextSeason} as the defending champ.`,
        subhead: "Can they run it back?",
      });
    }
  }

  // 3 & 4. Hot / cold streaks
  const streaks = computeCurrentStreaks(history);
  let hottest: { userId: string; length: number } | null = null;
  let coldest: { userId: string; length: number } | null = null;
  for (const [userId, streak] of Object.entries(streaks)) {
    if (!activeIds.has(userId) || usedUserIds.has(userId)) continue;
    if (streak.type === "W" && streak.length >= 3) {
      if (!hottest || streak.length > hottest.length) hottest = { userId, length: streak.length };
    }
    if (streak.type === "L" && streak.length >= 3) {
      if (!coldest || streak.length > coldest.length) coldest = { userId, length: streak.length };
    }
  }
  if (hottest) {
    const manager = history.managers[hottest.userId];
    if (manager) {
      pushFor(manager, {
        tag: "HEATING UP",
        text: `${manager.displayName} has won ${hottest.length} straight.`,
        subhead: "Nobody wants this matchup right now.",
      });
    }
  }
  if (coldest) {
    const manager = history.managers[coldest.userId];
    if (manager) {
      pushFor(manager, {
        tag: "SKID WATCH",
        text: `${manager.displayName} is on a ${coldest.length}-game losing streak.`,
        subhead: "Can they break it, or does the fall continue?",
      });
    }
  }

  // 5. Longest championship drought among current members (most seasons played, zero titles)
  const allTime = computeAllTimePowerRankings(history).filter((e) => isActive(e.manager));
  const droughtCandidate = allTime
    .filter((e) => e.titles === 0 && e.seasonsPlayed >= 2 && !usedUserIds.has(e.manager.userId))
    .sort((a, b) => b.seasonsPlayed - a.seasonsPlayed)[0];
  if (droughtCandidate) {
    pushFor(droughtCandidate.manager, {
      tag: "STILL WAITING",
      text: `${droughtCandidate.manager.displayName} has played ${droughtCandidate.seasonsPlayed} seasons without a title.`,
      subhead: "Is this finally the year?",
    });
  }

  // 6. Newcomer spotlight
  const newcomerIds = getNewcomerIds(history, activeIds);
  const newcomerId = [...newcomerIds].find((id) => !usedUserIds.has(id));
  if (newcomerId) {
    const manager = history.managers[newcomerId];
    if (manager) {
      pushFor(manager, {
        tag: "NEW BLOOD",
        text: `${manager.displayName} joins the league for the first time.`,
        subhead: "Can the rookie compete from day one?",
      });
    }
  }

  // 7. All-time #1 spotlight (power ranking, not title count - that's TITLE DEFENSE's job).
  // This is a claim about being literally #1, so unlike the other storylines it must NOT
  // fall back to the next-highest-ranked manager if #1 is already used elsewhere - that
  // would put "sits atop the rankings" on someone who doesn't. Omit instead.
  const leader = allTime[0];
  if (leader && !usedUserIds.has(leader.manager.userId)) {
    pushFor(leader.manager, {
      tag: "TOP DOG",
      text: `${leader.manager.displayName} sits atop the all-time power rankings.`,
      subhead: "Everyone else is chasing.",
    });
  }

  return headlines;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
