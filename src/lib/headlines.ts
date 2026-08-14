import type { LeagueHistory, Manager } from "./history";
import { getChampionHistory } from "./champions";
import { computeAllTimePowerRankings } from "./powerRankings";
import { computeCurrentStreaks } from "./streaks";
import { DRAFT_DATE } from "./constants";

export interface Headline {
  tag: string; // short label, e.g. "DRAFT DAY", "STREAK WATCH"
  text: string;
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
 * are eligible - anyone who's left the league is excluded. Anything that
 * can't be computed meaningfully (e.g. no active streak) is left out.
 */
export function generateHeadlines(history: LeagueHistory): Headline[] {
  const headlines: Headline[] = [];
  const activeIds = getActiveManagerIds(history);
  const isActive = (m: Manager) => activeIds.has(m.userId);

  // 1. Draft countdown
  const latestSeason = history.seasons[history.seasons.length - 1];
  if (latestSeason?.status === "pre_draft" || latestSeason?.status === "drafting") {
    const days = daysUntil(DRAFT_DATE);
    if (days > 0) {
      headlines.push({
        tag: "DRAFT DAY",
        text: `Draft day is ${days} day${days === 1 ? "" : "s"} away — who's building this year's champion?`,
      });
    } else {
      headlines.push({ tag: "DRAFT DAY", text: "Draft day is here. Good luck." });
    }
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
      headlines.push({
        tag: "TITLE DEFENSE",
        text: `${reigning.displayName} is chasing a ${ordinal(streakTitles + 1)} straight title in ${nextSeason} — can anyone stop the run?`,
        avatar: reigning.avatar,
      });
    } else {
      headlines.push({
        tag: "TITLE DEFENSE",
        text: `${reigning.displayName} enters ${nextSeason} as the defending champ — can they run it back?`,
        avatar: reigning.avatar,
      });
    }
  }

  // 3 & 4. Hot / cold streaks
  const streaks = computeCurrentStreaks(history);
  let hottest: { userId: string; length: number } | null = null;
  let coldest: { userId: string; length: number } | null = null;
  for (const [userId, streak] of Object.entries(streaks)) {
    if (!activeIds.has(userId)) continue;
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
      headlines.push({
        tag: "HEATING UP",
        text: `${manager.displayName} has won ${hottest.length} straight — nobody wants this matchup right now.`,
        avatar: manager.avatar,
      });
    }
  }
  if (coldest) {
    const manager = history.managers[coldest.userId];
    if (manager) {
      headlines.push({
        tag: "SKID WATCH",
        text: `${manager.displayName} is on a ${coldest.length}-game losing streak — can they break it, or does the fall continue?`,
        avatar: manager.avatar,
      });
    }
  }

  // 5. Longest championship drought among current members (most seasons played, zero titles)
  const allTime = computeAllTimePowerRankings(history).filter((e) => isActive(e.manager));
  const droughtCandidate = allTime
    .filter((e) => e.titles === 0 && e.seasonsPlayed >= 2)
    .sort((a, b) => b.seasonsPlayed - a.seasonsPlayed)[0];
  if (droughtCandidate) {
    headlines.push({
      tag: "STILL WAITING",
      text: `${droughtCandidate.manager.displayName} has played ${droughtCandidate.seasonsPlayed} seasons without a title — is this finally the year?`,
      avatar: droughtCandidate.manager.avatar,
    });
  }

  // 6. Newcomer spotlight
  const newcomerIds = getNewcomerIds(history, activeIds);
  const newcomerId = [...newcomerIds][0];
  if (newcomerId) {
    const manager = history.managers[newcomerId];
    if (manager) {
      headlines.push({
        tag: "NEW BLOOD",
        text: `${manager.displayName} joins the league for the first time — can the rookie compete from day one?`,
        avatar: manager.avatar,
      });
    }
  }

  // 7. All-time #1 spotlight (power ranking, not title count - that's TITLE DEFENSE's job)
  if (allTime.length > 0) {
    const leader = allTime[0];
    headlines.push({
      tag: "TOP DOG",
      text: `${leader.manager.displayName} sits atop the all-time power rankings — everyone else is chasing.`,
      avatar: leader.manager.avatar,
    });
  }

  return headlines;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
