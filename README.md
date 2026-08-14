# Bears Beats Battlestar Galactica — League Site

**Live at [bbbgleague.com](https://bbbgleague.com)**

A fan site for our Sleeper fantasy football league: all-time power rankings,
past champions, scoring graphs, and simple Elo-based predictions — all
computed live in the browser from Sleeper's public API. No backend, no
database, no API key.

## Pages

- **Home** — all-time power rankings + past champions corner panel, with a
  countdown to draft day while the season is pre-draft.
- **History** — season-by-season standings and champions, 2021–present.
- **Graphs** — weekly scoring trends per manager, plus all-time trivia
  (highest/lowest single-week score, biggest blowout).
- **Predictions** — an Elo rating built by replaying every historical
  matchup, with win probabilities for the current week once games exist.
- **Manager pages** (`/manager/:userId`) — career record, win %, points,
  Elo rank, a season-by-season breakdown (with that year's actual team
  name), and a full career scoring chart. Reachable by clicking any manager
  on the Home, History, or Predictions pages.

Managers are identified by their stable Sleeper **username** throughout the
site, not their team name — team names get renamed every season, so they're
only shown as secondary, season-specific context (e.g. on the History and
manager pages).

## How it works

- `src/api/sleeper.ts` — thin wrapper around `api.sleeper.app/v1`.
- `src/lib/history.ts` — walks the league's `previous_league_id` chain to
  assemble every season's rosters, weekly matchups, and playoff bracket into
  one dataset, cached in `localStorage` for ~45 minutes. Each manager's
  identity (username/avatar) is taken from their most recent season; team
  names are kept per-season in `teamNameBySeason`.
- `src/lib/powerRankings.ts` — the power ranking formula (per-season and
  all-time).
- `src/lib/champions.ts` — derives each season's champion from the winners
  bracket.
- `src/lib/elo.ts` — the Elo rating / prediction engine.
- `src/lib/constants.ts` — draft-day date for the home page countdown.

To point this at a different league, change `ROOT_LEAGUE_ID` in
`src/lib/history.ts`.

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
