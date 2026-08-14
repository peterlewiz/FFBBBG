/**
 * Fallback draft date, only used if Sleeper hasn't got a start time set
 * for the current season's draft. The real value comes from the league's
 * draft via `LeagueHistory.draftStartTime` - see src/lib/history.ts.
 */
export const DRAFT_DATE_FALLBACK = new Date("2026-09-03T19:00:00-05:00");

/** Resolve the draft date to show, preferring Sleeper's own schedule. */
export function resolveDraftDate(draftStartTime: number | null): Date {
  return draftStartTime ? new Date(draftStartTime) : DRAFT_DATE_FALLBACK;
}
