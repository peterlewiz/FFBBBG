import type { LeagueHistory } from "./history";
import { getChampionHistory } from "./champions";
import { computeAllTimePowerRankings } from "./powerRankings";
import { computeCurrentStreaks } from "./streaks";
import { DRAFT_DATE } from "./constants";

export interface Headline {
  tag: string; // short label, e.g. "DRAFT DAY", "STREAK WATCH"
  text: string;
}

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/**
 * ESPN-style rotating storylines generated from real league data: draft
 * countdown, title defense narratives, hot/cold streaks, championship
 * droughts, and the current all-time #1. Anything that can't be computed
 * meaningfully (e.g. no active streak) is simply left out.
 */
export function generateHeadlines(history: LeagueHistory): Headline[] {
  const headlines: Headline[] = [];

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

  // 2. Title defense narrative
  const champions = getChampionHistory(history); // newest first
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
      });
    } else {
      headlines.push({
        tag: "TITLE DEFENSE",
        text: `${reigning.displayName} enters ${nextSeason} as the defending champ — can they run it back?`,
      });
    }
  }

  // 3 & 4. Hot / cold streaks
  const streaks = computeCurrentStreaks(history);
  let hottest: { userId: string; length: number } | null = null;
  let coldest: { userId: string; length: number } | null = null;
  for (const [userId, streak] of Object.entries(streaks)) {
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
      });
    }
  }
  if (coldest) {
    const manager = history.managers[coldest.userId];
    if (manager) {
      headlines.push({
        tag: "SKID WATCH",
        text: `${manager.displayName} is on a ${coldest.length}-game losing streak — can they break it, or does the fall continue?`,
      });
    }
  }

  // 5. Longest championship drought (most seasons played, zero titles)
  const allTime = computeAllTimePowerRankings(history);
  const droughtCandidate = allTime
    .filter((e) => e.titles === 0 && e.seasonsPlayed >= 2)
    .sort((a, b) => b.seasonsPlayed - a.seasonsPlayed)[0];
  if (droughtCandidate) {
    headlines.push({
      tag: "STILL WAITING",
      text: `${droughtCandidate.manager.displayName} has played ${droughtCandidate.seasonsPlayed} seasons without a title — is this finally the year?`,
    });
  }

  // 6. All-time #1 spotlight
  if (allTime.length > 0) {
    const leader = allTime[0];
    headlines.push({
      tag: "TOP DOG",
      text: `${leader.manager.displayName} sits atop the all-time power rankings${
        leader.titles > 0 ? ` with ${leader.titles} title${leader.titles === 1 ? "" : "s"}` : ""
      } — everyone else is chasing.`,
    });
  }

  return headlines;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
