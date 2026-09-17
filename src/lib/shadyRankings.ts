import { supabase } from "./supabaseClient";

export interface PowerRankingRow {
  week: number;
  user_id: string;
  rank: number;
  /** Shady's write-up for this team's placement. */
  note?: string | null;
}

/**
 * Rankings live as a single JSON blob in `fantasypros_cache`, which is a
 * plain `cache_key -> jsonb` table that already exists in this project
 * with the same public read/write policies as everything else.
 *
 * A dedicated `power_rankings` table would model this better, but
 * creating one needs DDL rights the browser doesn't have (it only ever
 * holds the anon key), so shipping that version meant someone running
 * SQL in the Supabase dashboard before the page worked at all. Reusing a
 * table that's already there means the editor just works for whoever has
 * the passphrase. The FantasyPros code only ever touches its own fixed
 * keys by name - it never lists, sweeps or deletes - so the two can share
 * the table safely.
 */
const KV_TABLE = "fantasypros_cache";

/** One blob per league-season, so a week can be rewritten without
 * touching any other season's history. */
function storageKey(leagueId: string, season: string): string {
  return `shady-rankings:${leagueId}:${season}`;
}

interface RankingsBlob {
  rows: PowerRankingRow[];
}

function parseBlob(data: unknown): PowerRankingRow[] {
  if (!data || typeof data !== "object") return [];
  const rows = (data as RankingsBlob).rows;
  return Array.isArray(rows) ? rows : [];
}

export async function fetchRankings(leagueId: string, season: string): Promise<PowerRankingRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select("data")
    .eq("cache_key", storageKey(leagueId, season))
    .maybeSingle();
  // maybeSingle gives null rather than an error when nothing's been
  // posted yet, which is the normal state before the first ranking.
  if (error) throw new Error(error.message);
  return parseBlob(data?.data);
}

export interface RankingEntry {
  userId: string;
  /** Why they're here. Empty string saves as null. */
  note: string;
}

/**
 * Writes a whole week's ordering at once - the list is meaningless half
 * saved - replacing any previous ranking for that week so a week can be
 * re-ranked as often as you like without piling up duplicates.
 *
 * Read-modify-write on the shared blob, so two people ranking different
 * weeks at the same moment would have one overwrite the other. One
 * person holds the passphrase, so that race isn't worth a transaction.
 */
export async function saveRankings(
  leagueId: string,
  season: string,
  week: number,
  entries: RankingEntry[],
): Promise<void> {
  if (!supabase) throw new Error("Rankings aren't configured yet.");
  const existing = await fetchRankings(leagueId, season);
  const rows: PowerRankingRow[] = [
    ...existing.filter((r) => r.week !== week),
    ...entries.map((entry, i) => ({
      week,
      user_id: entry.userId,
      rank: i + 1,
      note: entry.note.trim() || null,
    })),
  ];

  const { error } = await supabase.from(KV_TABLE).upsert({
    cache_key: storageKey(leagueId, season),
    data: { rows } satisfies RankingsBlob,
    fetched_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Weeks that have a saved ranking, most recent first. */
export function rankedWeeks(rows: PowerRankingRow[]): number[] {
  return [...new Set(rows.map((r) => r.week))].sort((a, b) => b - a);
}

export interface RankedTeam {
  userId: string;
  rank: number;
  /** Places gained since the previous ranked week. Positive = moved up.
   * Null when there's no earlier week to compare against, or the team
   * wasn't ranked then. */
  delta: number | null;
  /** Shady's reasoning for the placement, if he wrote one. */
  note: string | null;
}

/**
 * One week's ordering, each team carrying its movement against the most
 * recent *earlier* ranked week - not week-1 specifically, so a skipped
 * week compares against the last real ranking instead of showing
 * everyone as new.
 */
export function rankingForWeek(rows: PowerRankingRow[], week: number): RankedTeam[] {
  const thisWeek = rows.filter((r) => r.week === week).sort((a, b) => a.rank - b.rank);
  const earlier = rows.map((r) => r.week).filter((w) => w < week);
  const prevWeek = earlier.length > 0 ? Math.max(...earlier) : null;
  const prevByUser = new Map(
    prevWeek === null ? [] : rows.filter((r) => r.week === prevWeek).map((r) => [r.user_id, r.rank]),
  );

  return thisWeek.map((r) => {
    const before = prevByUser.get(r.user_id);
    // A smaller rank number is better, so moving from 5 to 2 is +3.
    return {
      userId: r.user_id,
      rank: r.rank,
      delta: before === undefined ? null : before - r.rank,
      note: r.note?.trim() ? r.note.trim() : null,
    };
  });
}

function movementLabel(delta: number | null): string {
  if (delta === null) return "NEW";
  if (delta === 0) return "-";
  return delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`;
}

/**
 * A week's rankings as text to paste into Discord.
 *
 * Two shapes, because one format can't do both jobs. With no write-ups
 * it's a fenced code block: Discord renders those monospaced, which is
 * the only way rank/name/movement columns actually line up. Once there
 * are write-ups, column alignment stops being the point - a code block
 * would also strip the bold and wrap the prose badly - so each team
 * becomes a bold line with its reasoning in a blockquote under it.
 */
export function formatForDiscord(
  ranking: RankedTeam[],
  displayNameFor: (userId: string) => string,
  week: number,
): string {
  if (ranking.length === 0) return "";
  const title = `**Shady's Power Rankings - Week ${week}**`;

  if (ranking.some((r) => r.note)) {
    const blocks = ranking.map((r) => {
      const head = `**${r.rank}. ${displayNameFor(r.userId)}**  ${movementLabel(r.delta)}`;
      // Every line of a multi-line note needs its own '>' or Discord
      // ends the quote at the first newline.
      const body = r.note
        ? "\n" +
          r.note
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")
        : "";
      return head + body;
    });
    return [title, "", blocks.join("\n\n")].join("\n");
  }

  const rows = ranking.map((r) => ({
    rank: String(r.rank),
    name: displayNameFor(r.userId),
    // Movement is the last column, so arrows can't knock the rank and
    // name columns out of alignment even if a font renders them wide.
    move: movementLabel(r.delta),
  }));

  const rankWidth = Math.max(...rows.map((r) => r.rank.length));
  const nameWidth = Math.max(...rows.map((r) => r.name.length));

  const body = rows
    .map((r) => `${r.rank.padStart(rankWidth)}  ${r.name.padEnd(nameWidth)}  ${r.move}`)
    .join("\n");

  return [title, "```", body, "```"].join("\n");
}
