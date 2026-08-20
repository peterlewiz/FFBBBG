import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeagueHistory } from "../lib/useLeagueHistory";
import { usePredictions } from "../lib/usePredictions";
import { ErrorScreen, LoadingScreen } from "../components/StatusScreen";
import { useNflState } from "../lib/useNflState";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { computeLeaderboard, upsertPrediction, type PredictionRow } from "../lib/predictions";
import { ROOT_LEAGUE_ID, type LeagueHistory } from "../lib/history";
import { teamColor, teamColorAlpha } from "../lib/teamColors";
import { TeamBadge } from "../components/TeamBadge";
import { FightCard } from "../components/FightCard";

/**
 * Round-1 playoff games from the most recent complete season, so the page
 * has something to show (framed as a placeholder, not real picks) instead
 * of a dead end while the next season's schedule doesn't exist yet.
 */
function findPlayoffPreview(history: LeagueHistory) {
  for (let i = history.seasons.length - 1; i >= 0; i--) {
    const season = history.seasons[i];
    if (season.status !== "complete" || !season.bracket || season.bracket.length === 0) continue;

    const rosterToUser = new Map(
      season.rosters.filter((r) => r.ownerUserId).map((r) => [r.rosterId, r.ownerUserId as string]),
    );
    const games = season.bracket
      .filter((m) => m.r === 1 && m.t1 !== null && m.t2 !== null && m.w !== null)
      .map((m) => {
        const userA = rosterToUser.get(m.t1 as number);
        const userB = rosterToUser.get(m.t2 as number);
        if (!userA || !userB || !history.managers[userA] || !history.managers[userB]) return null;
        return {
          managerA: history.managers[userA],
          managerB: history.managers[userB],
          aWon: m.w === m.t1,
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);

    const champion = season.championRosterId
      ? rosterToUser.get(season.championRosterId)
      : undefined;

    if (games.length > 0) {
      return { season: season.season, games, champion: champion ? history.managers[champion] : null };
    }
  }
  return null;
}

const PICKER_STORAGE_KEY = "sleeper-site:picker-user-id";

export function Predictions() {
  const { data, loading, error } = useLeagueHistory();
  const predictionsState = usePredictions(ROOT_LEAGUE_ID);

  const { state: nflState, error: nflStateError } = useNflState();

  const [pickerUserId, setPickerUserId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(PICKER_STORAGE_KEY) : null,
  );
  const [saving, setSaving] = useState<string | null>(null); // matchup key currently saving
  const [saveError, setSaveError] = useState<string | null>(null);

  function choosePicker(userId: string) {
    setPickerUserId(userId);
    window.localStorage.setItem(PICKER_STORAGE_KEY, userId);
  }

  const currentSeason = data?.seasons[data.seasons.length - 1] ?? null;
  const targetWeek = nflState?.week ?? null;

  const matchups = useMemo(() => {
    if (!data || !currentSeason || targetWeek === null) return [];
    const rosterToUser = new Map(
      currentSeason.rosters
        .filter((r) => r.ownerUserId)
        .map((r) => [r.rosterId, r.ownerUserId as string]),
    );
    const weekRows = currentSeason.weeks.filter((w) => w.week === targetWeek);
    const byMatchup = new Map<number, typeof weekRows>();
    for (const row of weekRows) {
      if (row.matchupId === null) continue;
      const arr = byMatchup.get(row.matchupId) ?? [];
      arr.push(row);
      byMatchup.set(row.matchupId, arr);
    }

    return Array.from(byMatchup.entries())
      .filter(([, pair]) => pair.length === 2)
      .map(([matchupId, pair]) => {
        const [a, b] = pair;
        const userA = rosterToUser.get(a.rosterId);
        const userB = rosterToUser.get(b.rosterId);
        if (!userA || !userB) return null;
        const locked = a.points > 0 || b.points > 0;
        return {
          matchupId,
          managerA: data.managers[userA],
          managerB: data.managers[userB],
          locked,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [data, currentSeason, targetWeek]);

  const playoffPreview = useMemo(
    () => (data && matchups.length === 0 ? findPlayoffPreview(data) : null),
    [data, matchups.length],
  );

  const leaderboard = useMemo(
    () => (data ? computeLeaderboard(data, predictionsState.data) : []),
    [data, predictionsState.data],
  );

  if (!isSupabaseConfigured) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="text-lg font-medium text-primary">
          Predictions aren&apos;t set up yet
        </p>
        <p className="text-sm text-muted">
          This page needs a Supabase project connected (see the README) before anyone can make
          picks.
        </p>
      </div>
    );
  }

  if (loading || predictionsState.loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? "Unknown error"} />;
  if (predictionsState.error)
    return <ErrorScreen heading="Couldn't load predictions" message={predictionsState.error} />;

  async function handlePick(matchupId: number, pickedUserId: string) {
    if (!pickerUserId || !currentSeason || targetWeek === null) return;
    const match = matchups.find((m) => m.matchupId === matchupId);
    if (!match) return;

    const key = `${targetWeek}:${matchupId}`;
    setSaving(key);
    setSaveError(null);
    const row: PredictionRow = {
      league_id: ROOT_LEAGUE_ID,
      season: currentSeason.season,
      week: targetWeek,
      matchup_id: matchupId,
      picker_user_id: pickerUserId,
      picker_display_name: data!.managers[pickerUserId]?.displayName ?? pickerUserId,
      team_a_user_id: match.managerA.userId,
      team_b_user_id: match.managerB.userId,
      picked_user_id: pickedUserId,
    };
    try {
      await upsertPrediction(row);
      predictionsState.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save pick");
    } finally {
      setSaving(null);
    }
  }

  const managersSorted = Object.values(data.managers).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          Predictions
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pick who wins each matchup for the week. Picks lock once a game starts. See the{" "}
          <Link to="/elo" className="font-medium text-neon hover:underline">
            Elo
          </Link>{" "}
          tab for the ratings model.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
        <label htmlFor="picker" className="text-sm font-medium text-body">
          Who are you?
        </label>
        <select
          id="picker"
          value={pickerUserId ?? ""}
          onChange={(e) => choosePicker(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary"
        >
          <option value="" disabled>
            Select your name
          </option>
          {managersSorted.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>

      {saveError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {saveError}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface shadow-sm">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-primary">
            {targetWeek !== null ? `Week ${targetWeek} Matchups` : "This Week's Matchups"}
          </h2>
        </div>
        {nflStateError ? (
          <p className="px-5 py-4 text-sm text-red-400">{nflStateError}</p>
        ) : matchups.length === 0 && playoffPreview ? (
          <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
            <p className="text-sm text-muted">
              No matchups yet - here&apos;s the first round of {playoffPreview.season}&apos;s
              playoffs as a preview of what picks will look like once the season&apos;s underway.
            </p>
            <div className="flex flex-col gap-3">
              {playoffPreview.games.map((g, i) => (
                <FightCard
                  key={i}
                  centerLabel={`${playoffPreview.season} Playoffs · Round 1`}
                  left={{ manager: g.managerA, winner: g.aWon }}
                  right={{ manager: g.managerB, winner: !g.aWon }}
                />
              ))}
            </div>
            {playoffPreview.champion && (
              <p className="text-center text-sm text-muted">
                🏆{" "}
                <Link
                  to={`/manager/${playoffPreview.champion.userId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {playoffPreview.champion.displayName}
                </Link>{" "}
                went on to win the {playoffPreview.season} title.
              </p>
            )}
          </div>
        ) : matchups.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            No matchups available for this week yet.
          </p>
        ) : !pickerUserId ? (
          <p className="px-5 py-4 text-sm text-muted">
            Pick your name above to start making picks.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {matchups.map((m) => {
              const existingPick = predictionsState.data.find(
                (p) =>
                  p.picker_user_id === pickerUserId &&
                  p.season === currentSeason?.season &&
                  p.week === targetWeek &&
                  p.matchup_id === m.matchupId,
              );
              const isSaving = saving === `${targetWeek}:${m.matchupId}`;
              return (
                <li key={m.matchupId} className="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-5">
                  <PickButton
                    manager={m.managerA}
                    selected={existingPick?.picked_user_id === m.managerA.userId}
                    disabled={m.locked || isSaving}
                    onClick={() => handlePick(m.matchupId, m.managerA.userId)}
                  />
                  <span className="shrink-0 text-[10px] font-medium uppercase text-muted sm:text-xs">
                    vs
                  </span>
                  <PickButton
                    manager={m.managerB}
                    selected={existingPick?.picked_user_id === m.managerB.userId}
                    disabled={m.locked || isSaving}
                    onClick={() => handlePick(m.matchupId, m.managerB.userId)}
                  />
                  {m.locked && <span className="shrink-0 text-xs text-muted">🔒</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface shadow-sm">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-primary">
            Prediction Leaderboard
          </h2>
          <p className="text-xs text-muted">
            Ranked by pick accuracy across every scored matchup
          </p>
        </div>
        {leaderboard.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            No scored picks yet — check back once games have been played.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {leaderboard.map((entry, i) => (
              <li key={entry.manager.userId} className="flex items-center gap-4 px-5 py-3">
                <span className="w-6 text-center text-sm font-semibold text-muted">
                  {i + 1}
                </span>
                <Link
                  to={`/manager/${entry.manager.userId}`}
                  className="flex-1 truncate text-sm font-medium text-primary hover:underline"
                >
                  {entry.manager.displayName}
                </Link>
                <span className="text-xs text-muted">
                  {entry.correct}/{entry.total}
                </span>
                <span className="w-14 shrink-0 rounded-full bg-neon/10 px-2.5 py-1 text-center text-sm font-semibold text-neon">
                  {(entry.accuracy * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function PickButton({
  manager,
  selected,
  disabled,
  onClick,
}: {
  manager: { userId: string; displayName: string; avatar: string | null };
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const color = teamColor(manager.userId);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors ${
        selected ? "" : "border-line bg-surface text-body hover:bg-surface-2"
      } ${disabled && !selected ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      style={
        selected
          ? {
              color,
              borderColor: color,
              background: teamColorAlpha(manager.userId, 0.12),
              boxShadow: `0 0 18px ${teamColorAlpha(manager.userId, 0.3)}`,
            }
          : undefined
      }
    >
      <TeamBadge userId={manager.userId} displayName={manager.displayName} size={24} />
      <span className="truncate">{manager.displayName}</span>
      {selected && <span className="ml-auto shrink-0">✓</span>}
    </button>
  );
}
