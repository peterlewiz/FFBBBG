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
    (latestSeason?.rosters ?? [])
      .map((r) => r.ownerUserId)
      .filter((id): id is string => !!id),
  );
}

/** Managers whose only appearance in the league history is the current season. */
function getNewcomerIds(
  history: LeagueHistory,
  activeIds: Set<string>,
): Set<string> {
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
 * Deterministic pick from a list of phrasings.
 *
 * Deliberately not random: the ticker re-renders as it rotates and on
 * every data refresh, and a random pick would mean the same headline
 * re-words itself while you're reading it. Seeding on the week and the
 * manager keeps a given week's copy fixed, while still giving different
 * managers different lines and changing them all next week.
 */
function pickVariant<T>(variants: T[], seedText: string, week: number): T {
  // FNV-1a over the id, then the week folded in afterwards. Seeding with
  // the week up front instead let the id dominate, and one manager drew
  // the same phrasing four weeks running.
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    hash = Math.imul(hash ^ seedText.charCodeAt(i), 16777619) >>> 0;
  }
  hash = Math.imul(hash ^ week, 16777619) >>> 0;
  hash ^= hash >>> 13; // avalanche, so neighbouring weeks don't cluster
  return variants[(hash >>> 0) % variants.length];
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
    season.rosters
      .filter((r) => r.ownerUserId)
      .map((r) => [r.rosterId, r.ownerUserId as string]),
  );

  const weekNumbers = [...new Set(season.weeks.map((w) => w.week))].sort(
    (a, b) => b - a,
  );
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

/** "A", "A and B", "A, B and C" - so a headline about several managers
 * reads like a sentence instead of a list. */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

interface StandingsRow {
  manager: Manager;
  wins: number;
  losses: number;
  pointsFor: number;
}

/**
 * The current season's table, best record first. Only teams that have
 * actually played are included - a roster sitting on 0-0 before week one
 * isn't "winless", it just hasn't started.
 */
function currentStandings(history: LeagueHistory): StandingsRow[] {
  const season = history.seasons[history.seasons.length - 1];
  if (!season) return [];
  return season.rosters
    .map((r) => {
      const manager = r.ownerUserId
        ? history.managers[r.ownerUserId]
        : undefined;
      if (!manager) return null;
      return {
        manager,
        wins: r.wins,
        losses: r.losses,
        pointsFor: r.pointsFor,
      };
    })
    .filter(
      (row): row is StandingsRow => row !== null && row.wins + row.losses > 0,
    )
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
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
      const pts = top.points.toFixed(1);
      pushFor(
        top.manager,
        pickVariant(
          [
            {
              tag: "SHOWING OFF",
              text: `${top.manager.displayName} hung ${pts} on the league.`,
              subhead: "Eleven other teams had to sit there and watch.",
            },
            {
              tag: `WEEK ${week} HIGH`,
              text: `${top.manager.displayName} stumbled into ${pts} and will not stop talking about it.`,
              subhead: "Nobody is pretending that was roster management.",
            },
            {
              tag: "TOP SCORE",
              text: `Nobody outscored ${top.manager.displayName}'s ${pts} in week ${week}.`,
              subhead: "Frame it. It is not happening twice.",
            },
          ],
          top.manager.userId,
          week,
        ),
      );
    }
    if (blowout && isActive(blowout.winner)) {
      const margin = blowout.margin.toFixed(1);
      pushFor(
        blowout.winner,
        pickVariant(
          [
            {
              tag: "BLOWOUT",
              text: `${blowout.winner.displayName} put ${margin} on ${blowout.loser.displayName} and never looked back.`,
              subhead: `${blowout.loser.displayName} may as well have skipped the week.`,
            },
            {
              tag: "NOT CLOSE",
              text: `${blowout.winner.displayName} beat ${blowout.loser.displayName} by ${margin}.`,
              subhead: `${blowout.loser.displayName} was week ${week}'s designated victim.`,
            },
            {
              tag: "LOPSIDED",
              text: `${blowout.loser.displayName} lost to ${blowout.winner.displayName} by ${margin}.`,
              subhead: "At some point that stops being bad luck.",
            },
          ],
          blowout.winner.userId,
          week,
        ),
      );
    }
    if (closest && closest !== blowout && isActive(closest.winner)) {
      const margin = closest.margin.toFixed(1);
      pushFor(
        closest.winner,
        pickVariant(
          [
            {
              tag: "NAIL-BITER",
              text: `${closest.winner.displayName} survived ${closest.loser.displayName} by ${margin}.`,
              subhead: `${closest.loser.displayName} found a brand new way to lose.`,
            },
            {
              tag: "BY A HAIR",
              text: `${margin} points separated ${closest.winner.displayName} and ${closest.loser.displayName}.`,
              subhead: `${closest.loser.displayName} is going to be sick about that until Sunday.`,
            },
            {
              tag: "PHOTO FINISH",
              text: `${closest.winner.displayName} edged ${closest.loser.displayName} by ${margin}.`,
              subhead: "Winning ugly still counts. Losing close does not.",
            },
          ],
          closest.winner.userId,
          week,
        ),
      );
    }
    // Only newsworthy if they'd have beaten someone else - otherwise
    // it's just "the loser scored points".
    if (
      unlucky &&
      unlucky.loserPoints > (scores[Math.floor(scores.length / 2)]?.points ?? 0)
    ) {
      if (isActive(unlucky.loser)) {
        const pts = unlucky.loserPoints.toFixed(1);
        pushFor(
          unlucky.loser,
          pickVariant(
            [
              {
                tag: "TOUGH LUCK",
                text: `${unlucky.loser.displayName} scored ${pts} and lost anyway.`,
                subhead: "Points are lovely. The standings do not care.",
              },
              {
                tag: "ROBBED",
                text: `${pts} would have beaten most of the league. ${unlucky.loser.displayName} drew the one team it wouldn't.`,
                subhead: "Complain all you want, it goes down as an L.",
              },
              {
                tag: "WRONG WEEK",
                text: `${unlucky.loser.displayName} put up ${pts} and got absolutely nothing for it.`,
                subhead:
                  "Best week of their season, and it bought them nothing.",
              },
            ],
            unlucky.loser.userId,
            week,
          ),
        );
      }
    }
    if (bottom && bottom !== top && isActive(bottom.manager)) {
      const pts = bottom.points.toFixed(1);
      pushFor(
        bottom.manager,
        pickVariant(
          [
            {
              tag: "ROUGH WEEK",
              text: `${bottom.manager.displayName} managed ${pts} in week ${week}.`,
              subhead: "That is not a lineup, it is a cry for help.",
            },
            {
              tag: "YIKES",
              text: `${bottom.manager.displayName} scored ${pts}. League low, comfortably.`,
              subhead: "Not near the bottom. The bottom.",
            },
            {
              tag: "NO SHOW",
              text: `${pts}. That's what ${bottom.manager.displayName}'s entire roster produced.`,
              subhead: "A whole roster, and one functioning player.",
            },
          ],
          bottom.manager.userId,
          week,
        ),
      );
    }
  }

  // 0.5 Where the season actually stands. These sit behind last week's
  // results but ahead of the evergreen narratives below: once games are
  // being played, a perfect start or a winless one is the story, and
  // "enters the season as defending champ" is the filler.
  const standings = currentStandings(history);
  const seasonWeek = lastWeek?.week ?? 0;
  if (standings.length > 0) {
    const played = standings[0].wins + standings[0].losses;

    // An unbeaten record only means something once there's enough of it
    // to be hard - at 1-0 every second team in the league qualifies.
    //
    // Several unbeaten teams share one headline rather than getting one
    // each: the same sentence three times with different names reads
    // like the page is broken, and "the last unbeaten teams" is the more
    // interesting framing anyway.
    const unbeaten = standings.filter(
      (r) => r.losses === 0 && r.wins >= 2 && isActive(r.manager),
    );
    if (unbeaten.length === 1) {
      const row = unbeaten[0];
      pushFor(
        row.manager,
        pickVariant(
          [
            {
              tag: "PERFECT",
              text: `${row.manager.displayName} is ${row.wins}-0.`,
              subhead: "Someone is going to have to do something about that.",
            },
            {
              tag: "UNBEATEN",
              text: `Nobody has beaten ${row.manager.displayName} yet.`,
              subhead: `${row.wins} weeks, ${row.wins} wins. Tiresome.`,
            },
            {
              tag: "STILL PERFECT",
              text: `${row.manager.displayName} hasn't lost a game this season.`,
              subhead: "Enjoy the view while it lasts.",
            },
          ],
          row.manager.userId,
          seasonWeek,
        ),
      );
    } else if (unbeaten.length > 1) {
      const names = nameList(unbeaten.map((r) => r.manager.displayName));
      // Anchored to whichever of them doesn't already have a headline.
      // Anchoring to the first unconditionally meant the whole story was
      // dropped whenever that manager had already been written about -
      // which is exactly who tends to be unbeaten.
      const anchor = unbeaten.find((r) => !usedUserIds.has(r.manager.userId));
      if (anchor)
        pushFor(
          anchor.manager,
          pickVariant(
            [
              {
                tag: "UNBEATEN",
                text: `${names} are the last unbeaten teams.`,
                // "Possibly both" only parses with exactly two of them.
              subhead:
                unbeaten.length === 2
                  ? "One of them is a fraud. Possibly both."
                  : "At least one of them is a fraud.",
              },
              {
                tag: "STILL PERFECT",
                text: `Nobody has managed to beat ${names} yet.`,
                subhead: "Volunteers welcome.",
              },
            ],
            unbeaten.map((r) => r.manager.userId).join(""),
            seasonWeek,
          ),
        );
    }

    // Same treatment for the other end of the table.
    const winless = standings.filter(
      (r) => r.wins === 0 && r.losses >= 2 && isActive(r.manager),
    );
    if (winless.length === 1) {
      const row = winless[0];
      pushFor(
        row.manager,
        pickVariant(
          [
            {
              tag: "WINLESS",
              text: `${row.manager.displayName} is 0-${row.losses}.`,
              subhead: "The season is young. Not that young, but young.",
            },
            {
              tag: "STILL LOOKING",
              text: `${row.manager.displayName} is still hunting a first win.`,
              subhead: `${row.losses} tries, ${row.losses} failures.`,
            },
            {
              tag: "ROUGH START",
              text: `${row.losses} weeks in and ${row.manager.displayName} has nothing to show for it.`,
              subhead: "At least the draft picks will be good.",
            },
          ],
          row.manager.userId,
          seasonWeek,
        ),
      );
    } else if (winless.length > 1) {
      const names = nameList(winless.map((r) => r.manager.displayName));
      const losses = Math.max(...winless.map((r) => r.losses));
      const anchor = winless.find((r) => !usedUserIds.has(r.manager.userId));
      if (anchor)
        pushFor(
          anchor.manager,
          pickVariant(
            [
              {
                tag: "WINLESS",
                text: `${names} are all still looking for a first win.`,
                subhead: `${losses} weeks in. Somebody has to give.`,
              },
              {
                tag: "ROUGH START",
                text: `Nothing yet for ${names}.`,
                subhead: "At least they have each other.",
              },
            ],
            winless.map((r) => r.manager.userId).join(""),
            seasonWeek,
          ),
        );
    }

    // Most points scored so far, which is a different claim from the best
    // record and often a different manager - worth its own headline
    // precisely when the two disagree.
    const topScorer = [...standings].sort(
      (a, b) => b.pointsFor - a.pointsFor,
    )[0];
    if (topScorer && isActive(topScorer.manager) && played > 0) {
      const perWeek = (
        topScorer.pointsFor /
        (topScorer.wins + topScorer.losses)
      ).toFixed(1);
      pushFor(
        topScorer.manager,
        pickVariant(
          [
            {
              tag: "POINTS LEADER",
              text: `${topScorer.manager.displayName} has scored more than anyone: ${topScorer.pointsFor.toFixed(1)}.`,
              subhead: `${perWeek} a week, and counting.`,
            },
            {
              tag: "MOST POINTS",
              text: `Nobody has put up more than ${topScorer.manager.displayName}'s ${topScorer.pointsFor.toFixed(1)}.`,
              subhead: `Averaging ${perWeek}. Make of that what you will.`,
            },
            {
              tag: "SCOREBOARD",
              text: `${topScorer.manager.displayName} leads the league in points at ${perWeek} a week.`,
              subhead: "Points don't hang banners, but they help.",
            },
          ],
          topScorer.manager.userId,
          seasonWeek,
        ),
      );
    }
  }

  // 1. Draft countdown (not about a specific manager)
  const latestSeason = history.seasons[history.seasons.length - 1];
  if (
    latestSeason?.status === "pre_draft" ||
    latestSeason?.status === "drafting"
  ) {
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
  const champions = getChampionHistory(history).filter(
    (c) => c.champion && isActive(c.champion),
  );
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
      if (!hottest || streak.length > hottest.length)
        hottest = { userId, length: streak.length };
    }
    if (streak.type === "L" && streak.length >= 3) {
      if (!coldest || streak.length > coldest.length)
        coldest = { userId, length: streak.length };
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
  const allTime = computeAllTimePowerRankings(history).filter((e) =>
    isActive(e.manager),
  );
  const droughtCandidate = allTime
    .filter(
      (e) =>
        e.titles === 0 &&
        e.seasonsPlayed >= 2 &&
        !usedUserIds.has(e.manager.userId),
    )
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
      // "joins the league" stops being news the moment they've played.
      // Once there are games on the board the story is how it's going.
      const row = standings.find((r) => r.manager.userId === manager.userId);
      pushFor(
        manager,
        row
          ? {
              tag: "NEW BLOOD",
              text: `${manager.displayName} is ${row.wins}-${row.losses} as a rookie.`,
              subhead:
                row.wins > row.losses
                  ? "Nobody told them they're supposed to struggle."
                  : "A traditional welcome to the league.",
            }
          : {
              tag: "NEW BLOOD",
              text: `${manager.displayName} joins the league for the first time.`,
              subhead: "Can the rookie compete from day one?",
            },
      );
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
