# Bears Beats Battlestar Galactica — League Site

A fan site for our Sleeper fantasy football league: all-time power rankings,
past champions, scoring graphs, and simple Elo-based predictions — all
computed live in the browser from Sleeper's public API. No backend, no
database, no API key.

## Pages

- **Home** — all-time power rankings + past champions corner panel.
- **History** — season-by-season standings and champions, 2021–present.
- **Graphs** — weekly scoring trends per manager, plus all-time trivia
  (highest/lowest single-week score, biggest blowout).
- **Predictions** — an Elo rating built by replaying every historical
  matchup, with win probabilities for the current week once games exist.

## How it works

- `src/api/sleeper.ts` — thin wrapper around `api.sleeper.app/v1`.
- `src/lib/history.ts` — walks the league's `previous_league_id` chain to
  assemble every season's rosters, weekly matchups, and playoff bracket into
  one dataset, cached in `localStorage` for ~45 minutes.
- `src/lib/powerRankings.ts` — the power ranking formula (per-season and
  all-time).
- `src/lib/champions.ts` — derives each season's champion from the winners
  bracket.
- `src/lib/elo.ts` — the Elo rating / prediction engine.

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

## Deploying

This is a static site, so it deploys anywhere that serves static files.
Recommended: [Vercel](https://vercel.com) free tier.

1. Push this repo to GitHub.
2. On vercel.com, "Add New Project" → import the GitHub repo. Vercel
   auto-detects Vite; defaults work as-is.
3. Once deployed, add your custom domain under the project's **Settings →
   Domains** and follow Vercel's DNS instructions at your domain registrar.
