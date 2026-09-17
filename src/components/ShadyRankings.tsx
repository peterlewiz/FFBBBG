import { useEffect, useMemo, useState } from "react";
import { TeamBadge } from "./TeamBadge";
import { teamColor } from "../lib/teamColors";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  fetchRankings,
  formatForDiscord,
  rankedWeeks,
  rankingForWeek,
  saveRankings,
  type PowerRankingRow,
  type RankingEntry,
} from "../lib/shadyRankings";
import type { Manager } from "../lib/history";

// Checked in the browser, and therefore present in the JS bundle: this
// keeps the editor out of the way of casual visitors, it is not access
// control. The table's RLS policies are public-write regardless, matching
// the rest of the site - see supabase/schema.sql.
const PASSPHRASE = "Peterthegoat";
const UNLOCK_KEY = "sleeper-site:shady-unlocked";
// Long enough for a real dig, short enough that a Discord post of twelve
// of them still reads as a ranking rather than an essay.
const NOTE_MAX = 280;

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-muted">new</span>;
  if (value === 0) return <span className="text-[11px] text-muted">—</span>;
  const up = value > 0;
  return (
    <span className={`text-[11px] font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

export function ShadyRankings({
  leagueId,
  season,
  week,
  managers,
}: {
  leagueId: string;
  season: string;
  week: number | null;
  managers: Manager[];
}) {
  const [rows, setRows] = useState<PowerRankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [unlocked, setUnlocked] = useState(false);
  const [attempt, setAttempt] = useState("");
  const [attemptFailed, setAttemptFailed] = useState(false);

  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const [draft, setDraft] = useState<RankingEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UNLOCK_KEY) === "1") setUnlocked(true);
    } catch {
      // sessionStorage unavailable - just stays locked until typed again
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    fetchRankings(leagueId, season)
      .then((result) => {
        if (cancelled) return;
        setRows(result);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load rankings");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, season]);

  const weeks = useMemo(() => rankedWeeks(rows), [rows]);
  const shownWeek = viewWeek ?? weeks[0] ?? week;
  const ranking = useMemo(
    () => (shownWeek === null ? [] : rankingForWeek(rows, shownWeek)),
    [rows, shownWeek],
  );
  const byUserId = useMemo(() => new Map(managers.map((m) => [m.userId, m])), [managers]);

  async function copyForDiscord() {
    if (shownWeek === null) return;
    const text = formatForDiscord(
      ranking,
      (userId) => byUserId.get(userId)?.displayName ?? userId,
      shownWeek,
    );
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context and permission; fall back to
      // a selectable prompt rather than failing silently.
      window.prompt("Copy this into Discord:", text);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  /** Drop back to the passphrase prompt, and forget the remembered
   * unlock so it's actually gated again rather than one reload away. */
  function lock() {
    setUnlocked(false);
    setDraft(null);
    try {
      sessionStorage.removeItem(UNLOCK_KEY);
    } catch {
      // nothing persisted to clear
    }
  }

  function unlock() {
    if (attempt.trim() !== PASSPHRASE) {
      setAttemptFailed(true);
      return;
    }
    setUnlocked(true);
    setAttempt("");
    setAttemptFailed(false);
    try {
      sessionStorage.setItem(UNLOCK_KEY, "1");
    } catch {
      // not persisting is fine, it just means retyping next tab
    }
  }

  /** Seed the editor from whatever's already ranked - order and write-ups
   * both - then append anyone missing so a new team can't be silently
   * dropped from the list. */
  function startEditing() {
    const seeded: RankingEntry[] = ranking.map((r) => ({ userId: r.userId, note: r.note ?? "" }));
    const seededIds = new Set(seeded.map((e) => e.userId));
    const missing = managers
      .filter((m) => !seededIds.has(m.userId))
      .map((m) => ({ userId: m.userId, note: "" }));
    setDraft([...seeded, ...missing]);
  }

  function move(index: number, dir: -1 | 1) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function setNote(index: number, note: string) {
    setDraft((prev) => prev?.map((entry, i) => (i === index ? { ...entry, note } : entry)) ?? prev);
  }

  async function save() {
    if (!draft || week === null) return;
    setSaving(true);
    setError(null);
    try {
      await saveRankings(leagueId, season, week, draft);
      setRows(await fetchRankings(leagueId, season));
      setViewWeek(week);
      setDraft(null);
    } catch (e) {
      // Keep the draft on screen - a failed save shouldn't cost you the
      // ordering and the write-ups you just typed out.
      setError(e instanceof Error ? e.message : "Couldn't save rankings");
    } finally {
      setSaving(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <p className="px-5 py-4 text-sm text-muted">
        Rankings need Supabase connected (see the README).
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">🕶️ Shady Power Rankings</h2>
          <p className="text-xs text-muted">
            Posted after each completed week. Arrows show the move since the last ranked week.
          </p>
        </div>
        {ranking.length > 0 && (
          <button
            type="button"
            onClick={copyForDiscord}
            title="Copy this week's rankings, formatted for Discord"
            className="ml-auto rounded-lg bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/30"
          >
            {copied ? "Copied" : "Copy for Discord"}
          </button>
        )}
        {weeks.length > 0 && (
          <select
            value={shownWeek ?? ""}
            onChange={(e) => setViewWeek(Number(e.target.value))}
            className={`rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary ${
              ranking.length > 0 ? "" : "ml-auto"
            }`}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="border-b border-line px-5 py-2 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="px-5 py-4 text-sm text-muted">Loading rankings…</p>
      ) : draft ? (
        <div className="p-5">
          <p className="mb-3 text-xs text-muted">
            Ordering week {week} (the last completed week). Top of the list is #1, and every write-up
            is optional.
          </p>
          <ol className="flex flex-col gap-2">
            {draft.map((entry, i) => {
              const m = byUserId.get(entry.userId);
              return (
                <li
                  key={entry.userId}
                  className="rounded-lg border border-line bg-surface-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-center text-sm font-bold text-muted">
                      {i + 1}
                    </span>
                    <TeamBadge
                      userId={entry.userId}
                      displayName={m?.displayName ?? entry.userId}
                      size={22}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-medium"
                      style={{ color: teamColor(entry.userId) }}
                    >
                      {m?.displayName ?? entry.userId}
                    </span>
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="rounded px-2 py-0.5 text-sm text-body hover:bg-line disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === draft.length - 1}
                      aria-label="Move down"
                      className="rounded px-2 py-0.5 text-sm text-body hover:bg-line disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <textarea
                    value={entry.note}
                    onChange={(e) => setNote(i, e.target.value)}
                    maxLength={NOTE_MAX}
                    rows={2}
                    placeholder={`Why is ${m?.displayName ?? "this team"} here?`}
                    aria-label={`Write-up for ${m?.displayName ?? entry.userId}`}
                    className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary placeholder:text-muted"
                  />
                  <div className="mt-0.5 text-right text-[10px] text-muted">
                    {entry.note.length}/{NOTE_MAX}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving || week === null}
              className="rounded-lg bg-neon px-4 py-1.5 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {saving ? "Saving…" : `Save week ${week}`}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg border border-line px-4 py-1.5 text-sm text-body hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {ranking.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No rankings posted yet.</p>
          ) : (
            <ol className="divide-y divide-line">
              {ranking.map((r) => {
                const m = byUserId.get(r.userId);
                return (
                  <li key={r.userId} className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-sm font-bold text-muted">{r.rank}</span>
                      <TeamBadge
                        userId={r.userId}
                        displayName={m?.displayName ?? r.userId}
                        size={22}
                      />
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium"
                        style={{ color: teamColor(r.userId) }}
                      >
                        {m?.displayName ?? r.userId}
                      </span>
                      <Delta value={r.delta} />
                    </div>
                    {r.note && (
                      // Indented to line up with the name, not the rank
                      // number, so the column of write-ups reads as one
                      // block down the page.
                      <p className="mt-1 pl-[3.1rem] pr-2 text-xs leading-relaxed text-body">
                        {r.note}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          <div className="border-t border-line px-5 py-3">
            {unlocked ? (
              // The unlock is remembered for the tab, so without this the
              // passphrase looks like it stopped existing: you return to
              // the page, the editor is simply open, and there's no sign
              // it was ever gated or any way back out.
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={startEditing}
                  disabled={week === null}
                  className="rounded-lg bg-neon/20 px-3 py-1.5 text-xs font-semibold text-neon hover:bg-neon/30 disabled:opacity-50"
                >
                  {ranking.length === 0 ? "Post" : "Re-rank"} week {week}
                </button>
                <span className="text-xs text-muted">🔓 Editing unlocked</span>
                <button
                  onClick={lock}
                  className="ml-auto rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-body hover:bg-surface-2"
                >
                  Lock
                </button>
              </div>
            ) : (
              // A real form rather than a keydown handler, so Enter
              // submits natively - a bare onKeyDown didn't reliably fire
              // and the field plainly invites pressing Enter.
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  unlock();
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="password"
                  value={attempt}
                  onChange={(e) => {
                    setAttempt(e.target.value);
                    setAttemptFailed(false);
                  }}
                  placeholder="Passphrase to edit"
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold text-body hover:bg-line"
                >
                  Unlock
                </button>
                {attemptFailed && <span className="text-xs text-red-400">Nope.</span>}
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
