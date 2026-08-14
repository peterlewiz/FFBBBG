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
export interface LegacySeason {
  season: string;
  /** Where it was played, shown as a small label in the UI. */
  platform: string;
  /** Sleeper user_id of the champion, so they link up with everything else. */
  championUserId: string | null;
  runnerUpUserId?: string | null;
}

export const LEGACY_SEASONS: LegacySeason[] = [
  {
    season: "2020",
    platform: "ESPN",
    championUserId: "739228047332548608", // frtheo
  },
];
