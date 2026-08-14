// 7:00 PM Central on Sept 3 falls in Central Daylight Time (UTC-5).
// Encoding the offset explicitly keeps this correct regardless of the
// visitor's own timezone.
export const DRAFT_DATE = new Date("2026-09-03T19:00:00-05:00");
