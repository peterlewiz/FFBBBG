-- Run this once in the Supabase SQL editor (Project → SQL Editor → New
-- query → paste → Run) to set up the table the Predictions pick'em page
-- reads/writes.
--
-- No secrets in this file - it's safe to commit.

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  league_id text not null,
  season text not null,
  week int not null,
  matchup_id int not null,
  picker_user_id text not null,
  picker_display_name text not null,
  team_a_user_id text not null,
  team_b_user_id text not null,
  picked_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, season, week, matchup_id, picker_user_id)
);

alter table predictions enable row level security;

-- Public read/write, no login. This matches the rest of the site: a
-- "picker" identifies themselves by picking their name from the manager
-- list rather than authenticating, so there's no server-side way to
-- verify a write actually came from that person. This is an intentional
-- trade-off for a small trusted friend league, not a public tool - do not
-- reuse this policy for anything with real stakes.
create policy "public read" on predictions
  for select using (true);

create policy "public insert" on predictions
  for insert with check (true);

create policy "public update" on predictions
  for update using (true) with check (true);

-- Weekly snapshots of the Monte Carlo playoff odds, so the page can show
-- "up/down since last week" against a fixed number instead of comparing
-- a live computation to itself. `week` is the current NFL week (Sleeper's
-- own clock) at the time it was written - whichever visit is the last one
-- in a given week naturally leaves that week's final snapshot in place,
-- since it's overwritten in-place until the NFL week advances past it.
create table if not exists playoff_odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  league_id text not null,
  season text not null,
  week int not null,
  user_id text not null,
  playoff_pct numeric not null,
  title_pct numeric not null,
  computed_at timestamptz not null default now(),
  unique (league_id, season, week, user_id)
);

alter table playoff_odds_snapshots enable row level security;

create policy "public read" on playoff_odds_snapshots
  for select using (true);

create policy "public insert" on playoff_odds_snapshots
  for insert with check (true);

create policy "public update" on playoff_odds_snapshots
  for update using (true) with check (true);
