# Bears Beats Battlestar Galactica — League Site

**Live at [bbbgleague.com](https://bbbgleague.com)**

A fan site for our Sleeper fantasy football league: all-time power rankings,
past champions, scoring graphs, an Elo rating, and a shared weekly pick'em
pool — all computed live in the browser from Sleeper's public API. No
backend to run; the only external service is a small shared database for
predictions (see below).

## Pages

- **Home** — all-time power rankings + past champions corner panel, with a
  countdown to draft day while the season is pre-draft.
- **History** — season-by-season standings and champions, 2021–present.
- **Graphs** — weekly scoring trends per manager, plus all-time trivia
  (highest/lowest single-week score, biggest blowout).
- **Elo** — a rating built by replaying every historical matchup, with win
  probabilities for the current week's matchups.
- **Predictions** — pick who wins each of this week's matchups (pick your
  name from a dropdown, no login), shared across the whole league, with a
  leaderboard ranking everyone's pick accuracy. Needs Supabase configured
  (see below) — shows a friendly "not set up yet" message otherwise.
- **Manager pages** (`/manager/:userId`) — career record, win %, points,
  Elo rank, prediction accuracy, a season-by-season breakdown (with that
  year's actual team name), and a full career scoring chart. Reachable by
  clicking any manager throughout the site.

Managers are identified by their stable Sleeper **username** throughout the
site, not their team name — team names get renamed every season, so they're
only shown as secondary, season-specific context (e.g. on the History and
manager pages).

## How it works

- `src/api/sleeper.ts` — thin wrapper around `api.sleeper.app/v1`, including
  `getNflState()` (the authoritative "what week is it" clock, used to find
  the upcoming week to predict).
- `src/lib/history.ts` — walks the league's `previous_league_id` chain to
  assemble every season's rosters, weekly matchups, and playoff bracket into
  one dataset, cached in `localStorage` for ~45 minutes. Each manager's
  identity (username/avatar) is taken from their most recent season; team
  names are kept per-season in `teamNameBySeason`.
- `src/lib/powerRankings.ts` — the power ranking formula (per-season and
  all-time).
- `src/lib/champions.ts` — derives each season's champion from the winners
  bracket.
- `src/lib/elo.ts` — the Elo rating engine.
- `src/lib/predictions.ts` + `src/lib/supabaseClient.ts` — the pick'em data
  layer (see Predictions setup below).
- `src/lib/constants.ts` — draft-day date for the home page countdown.

To point this at a different league, change `ROOT_LEAGUE_ID` in
`src/lib/history.ts`.

## Homepage headlines & custom manager images

The homepage's rotating "breaking news" card (`src/lib/headlines.ts` +
`src/components/HeadlinesTicker.tsx`) generates ESPN-style storylines from
real data - draft countdown, title defense, hot/cold streaks, championship
droughts, a newcomer spotlight, and the all-time #1. Each manager appears
in at most one headline per rotation. Only current league members (a
roster in the latest season) are eligible, so anyone who's left the
league never shows up.

Each headline shows a photo for the manager it's about. By default that's
their Sleeper avatar (small, on a gradient placeholder background), but
you can drop in a custom image - AI-generated or otherwise, doesn't need
to match Sleeper - and it'll automatically be used full-bleed instead, no
code changes needed. See [`public/manager-images/README.md`](./public/manager-images/README.md)
for the exact filename convention (`<userId>.jpg`, keyed by Sleeper user
ID so it survives team-name and even display-name changes).

## Predictions setup (Supabase)

The Predictions page needs a small shared Postgres database so everyone's
picks and the leaderboard are visible to the whole league, not just stored
in one person's browser.

1. Create a free project at [supabase.com](https://supabase.com) (sign up →
   New Project → pick a name/region/DB password → wait ~2 min to provision).
2. In the Supabase dashboard, go to **SQL Editor → New query**, paste the
   contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it.
   This creates the `predictions` table with public read/write enabled (see
   the comment in that file for why — it matches this site's no-login
   design, not meant as a security model for anything with real stakes).
3. Go to **Project Settings → API** and copy the **Project URL** and
   **anon public key**.
4. Locally: copy `.env.example` to `.env.local` and fill in those two
   values as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. In production: add the same two variables in **Vercel → Project →
   Settings → Environment Variables**, then redeploy.

Without these set, every other page still works — Predictions just shows a
"not set up yet" message instead of crashing.

## Local development

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

## Build

```bash
npm run build
```

Outputs a static site to `dist/` — no server required to host it.

## Deployment

- **Hosting:** [Vercel](https://vercel.com) free tier, auto-deploying from
  the `main` branch of this repo on every push.
- **Domain:** `bbbgleague.com`, registered via [Porkbun](https://porkbun.com),
  DNS pointed at Vercel (`A` record on `@` → `76.76.21.21`, `CNAME` on `www`
  → `cname.vercel-dns.com`).
- **Predictions database:** [Supabase](https://supabase.com) free tier —
  see setup steps above.
