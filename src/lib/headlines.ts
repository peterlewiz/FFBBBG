import type { LeagueHistory, Manager } from "./history";
import { getChampionHistory } from "./champions";
import { computeAllTimePowerRankings } from "./powerRankings";
import { computeCurrentStreaks } from "./streaks";
import { resolveDraftDate } from "./constants";

export interface Headline {
  tag: string; // short label, e.g. "DRAFT DAY", "STREAK WATCH"
  text: string;
  /** Shorter secondary line, ESPN-subhead style. */
  subhead: string;
  /** The manager this headline is about, if any - lets the UI show their photo. */
  manager?: Manager;
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


interface WeekGame {
  winner: Manager;
  loser: Manager;
  winnerPoints: number;
  loserPoints: number;
  margin: number;
}

interface CompletedWeek {
  week: number;
  games: WeekGame[];
  /** Every team's score that week, highest first. */
  scores: { manager: Manager; points: number }[];
}

/**
 * The most recent week of the current season that's actually finished,
 * with its results resolved to managers.
 *
 * "Finished" means every team in that week has a score. A week that's
 * half-played has real points on the board for the early games, so
 * taking the latest week with *any* points would produce headlines
 * mid-Sunday about a week nobody has finished - "lowest score of the
 * week" being a team whose players haven't kicked off yet.
 */
function findLatestCompletedWeek(history: LeagueHistory): CompletedWeek | null {
  const season = history.seasons[history.seasons.length - 1];
  if (!season) return null;
  const rosterToUser = new Map(
    season.rosters.filter((r) => r.ownerUserId).map((r) => [r.rosterId, r.ownerUserId as string]),
  );

  const weekNumbers = [...new Set(season.weeks.map((w) => w.week))].sort((a, b) => b - a);
  for (const week of weekNumbers) {
    const rows = season.weeks.filter((w) => w.week === week);
    if (rows.length === 0 || rows.some((r) => r.points <= 0)) continue;

    const byMatchup = new Map<number, typeof rows>();
    for (const row of rows) {
      if (row.matchupId === null) continue;
      const arr = byMatchup.get(row.matchupId) ?? [];
      arr.push(row);
      byMatchup.set(row.matchupId, arr);
    }

    const games: WeekGame[] = [];
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (a.points === b.points) continue; // a tie has no winner to name
      const userA = rosterToUser.get(a.rosterId);
      const userB = rosterToUser.get(b.rosterId);
      const managerA = userA ? history.managers[userA] : undefined;
      const managerB = userB ? history.managers[userB] : undefined;
      if (!managerA || !managerB) continue;
      const aWon = a.points > b.points;
      games.push({
        winner: aWon ? managerA : managerB,
        loser: aWon ? managerB : managerA,
        winnerPoints: Math.max(a.points, b.points),
        loserPoints: Math.min(a.points, b.points),
        margin: Math.abs(a.points - b.points),
      });
    }

    const scores = rows
      .map((r) => {
        const userId = rosterToUser.get(r.rosterId);
        const manager = userId ? history.managers[userId] : undefined;
        return manager ? { manager, points: r.points } : null;
      })
      .filter((x): x is { manager: Manager; points: number } => x !== null)
      .sort((x, y) => y.points - x.points);

    if (games.length > 0) return { week, games, scores };
  }
  return null;
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

  function pushFor(manager: Manager, headline: Omit<Headline, "manager">) {
    if (usedUserIds.has(manager.userId)) return;
    usedUserIds.add(manager.userId);
    headlines.push({ ...headline, manager });
  }

  // 0. Last week's results. These lead: once the season is underway,
  // what actually happened on Sunday is the news, and the preseason
  // narratives below are the filler around it.
  const lastWeek = findLatestCompletedWeek(history);
  if (lastWeek) {
    const { week, games, scores } = lastWeek;
    const top = scores[0];
    const bottom = scores[scores.length - 1];
    const blowout = [...games].sort((a, b) => b.margin - a.margin)[0];
    const closest = [...games].sort((a, b) => a.margin - b.margin)[0];
    // Highest scorer who still lost - only counts as a story if the
    // week actually produced one.
    const unlucky = [...games]
      .filter((g) => g.loserPoints > 0)
      .sort((a, b) => b.loserPoints - a.loserPoints)[0];

    if (top && isActive(top.manager)) {
      pushFor(top.manager, {
        tag: `WEEK ${week} HIGH`,
        text: `${top.manager.displayName} led the league with ${top.points.toFixed(1)} in week ${week}.`,
        subhead: "Nobody else got close.",
      });
    }
    if (blowout && isActive(blowout.winner)) {
      pushFor(blowout.winner, {
        tag: "BLOWOUT",
        text: `${blowout.winner.displayName} beat ${blowout.loser.displayName} by ${blowout.margin.toFixed(1)}.`,
        subhead: `Week ${week}'s most lopsided result.`,
      });
    }
    if (closest && closest !== blowout && isActive(closest.winner)) {
      pushFor(closest.winner, {
        tag: "NAIL-BITER",
        text: `${closest.winner.displayName} edged ${closest.loser.displayName} by ${closest.margin.toFixed(1)}.`,
        subhead: `The closest game of week ${week}.`,
      });
    }
    // Only newsworthy if they'd have beaten someone else - otherwise
    // it's just "the loser scored points".
    if (unlucky && unlucky.loserPoints > (scores[Math.floor(scores.length / 2)]?.points ?? 0)) {
      if (isActive(unlucky.loser)) {
        pushFor(unlucky.loser, {
          tag: "TOUGH LUCK",
          text: `${unlucky.loser.displayName} scored ${unlucky.loserPoints.toFixed(1)} and still lost.`,
          subhead: "Right week, wrong opponent.",
        });
      }
    }
    if (bottom && bottom !== top && isActive(bottom.manager)) {
      pushFor(bottom.manager, {
        tag: "ROUGH WEEK",
        text: `${bottom.manager.displayName} managed just ${bottom.points.toFixed(1)} in week ${week}.`,
        subhead: "The lineup needs a look.",
      });
    }
  }

  // 1. Draft countdown (not about a specific manager)
  const latestSeason = history.seasons[history.seasons.length - 1];
  if (latestSeason?.status === "pre_draft" || latestSeason?.status === "drafting") {
    const days = daysUntil(resolveDraftDate(history.draftStartTime));
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
    const titleSeason = Number(champions[0].season);
    const nextSeason = titleSeason + 1;
    // "enters 2026 as the defending champ" only reads right before a ball
    // is snapped. Once there are results on the board it's stale, so the
    // wording switches to the present tense.
    const seasonUnderway = lastWeek !== null;
    if (streakTitles >= 2) {
      pushFor(reigning, {
        tag: "TITLE DEFENSE",
        text: seasonUnderway
          ? `${reigning.displayName} is defending ${streakTitles} straight titles.`
          : `${reigning.displayName} is chasing a ${ordinal(streakTitles + 1)} straight title in ${nextSeason}.`,
        subhead: "Can anyone stop the run?",
      });
    } else {
      pushFor(reigning, {
        tag: "TITLE DEFENSE",
        text: seasonUnderway
          ? `${reigning.displayName} is defending the ${titleSeason} title.`
          : `${reigning.displayName} enters ${nextSeason} as the defending champ.`,
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
