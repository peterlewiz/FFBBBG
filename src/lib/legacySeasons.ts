/**
 * Seasons the league played before moving to Sleeper (ESPN league
 * 13670323, which covers 2019-2021). That league is private and the
 * login was lost, so this data is entered by hand for now.
 *
 * Only what we actually know goes in here - a season with just a
 * champion still shows up in Past Champions and counts toward career
 * titles, without inventing standings we don't have. If the ESPN league
 * is opened up later, this can be replaced with a fetched snapshot.
 */
export interface LegacyStanding {
  rank: number;
  /** Sleeper user_id, so this row links up with everything else - null for
   * someone who's never been one of the site's tracked managers. */
  userId: string | null;
  /** Only used when userId is null - there's no Manager record to name them from. */
  name?: string;
  wins: number;
  losses: number;
  ties: number;
}

export interface LegacySeason {
  season: string;
  /** Where it was played, shown as a small label in the UI. */
  platform: string;
  /** Sleeper user_id of the champion, so they link up with everything else. */
  championUserId: string | null;
  runnerUpUserId?: string | null;
  /**
   * Final regular-season standings, if known - rank 1 (best) to last.
   * Optional: a season with just a champion still shows up in Past
   * Champions and counts toward career titles without this.
   */
  standings?: LegacyStanding[];
}

export const LEGACY_SEASONS: LegacySeason[] = [
  {
    season: "2020",
    platform: "ESPN",
    championUserId: "739228047332548608", // frtheo
    standings: [
      { rank: 1, userId: "739228047332548608", wins: 9, losses: 4, ties: 0 }, // frtheo
      { rank: 2, userId: "718138810201878528", wins: 9, losses: 4, ties: 0 }, // Shady43
      { rank: 3, userId: "739598324197392384", wins: 7, losses: 6, ties: 0 }, // KokoM
      { rank: 4, userId: null, name: "Mario", wins: 9, losses: 4, ties: 0 },
      { rank: 5, userId: "738538726719930368", wins: 5, losses: 8, ties: 0 }, // 3mojt
      { rank: 6, userId: "738510505450283008", wins: 7, losses: 6, ties: 0 }, // plewiz
      { rank: 7, userId: "740737264774217728", wins: 5, losses: 8, ties: 0 }, // maryghaly
      { rank: 8, userId: "737330429740363776", wins: 5, losses: 8, ties: 0 }, // Youssefgirges
      { rank: 9, userId: "732791680197054464", wins: 5, losses: 8, ties: 0 }, // mmasoud2
      { rank: 10, userId: null, name: "Beshoy Bucketz", wins: 4, losses: 9, ties: 0 },
    ],
  },
];
