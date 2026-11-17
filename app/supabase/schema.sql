-- Leanward: database setup for Supabase.
-- Leanward has its own Supabase project, separate from PR Forge's (PRD §15 Q6b, decisions 2026-11-03).
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run. Safe to run more than once.
--
-- Rules for every Leanward table:
--   * the name starts with lw_;
--   * row level security is on;
--   * access is granted explicitly to the anon / authenticated roles.
--
-- Rules for every synced table (M2, docs/development-plan.md):
--   * one row per item, keyed by (user_id, id); the phone makes the id, so a repeated upload never duplicates;
--   * updated_at is stamped by the server on every write, so a phone with a wrong clock can't confuse syncing;
--   * deleting in the app sets deleted = true (a "tombstone") so the deletion reaches the person's other devices;
--   * a signed-in person can read, add and change only their own rows, and can't move a row to someone else;
--   * nobody can hard-delete rows through the app. Rows are only removed with the account (ACC-1).

-- ---------------------------------------------------------------------------
-- M0: a test row the app reads to confirm it reaches the database.
-- ---------------------------------------------------------------------------
create table if not exists public.lw_ping (
  id      smallint primary key,
  message text not null
);

insert into public.lw_ping (id, message) values (1, 'Connected')
  on conflict (id) do nothing;

alter table public.lw_ping enable row level security;

drop policy if exists "lw_ping readable" on public.lw_ping;
create policy "lw_ping readable" on public.lw_ping
  for select to anon, authenticated
  using (true);

grant select on public.lw_ping to anon, authenticated;

-- ---------------------------------------------------------------------------
-- M0: error reports (PRD §15 Q13: Leanward's own table, no third party).
-- The app can only insert. Nobody can read reports through the API; you read them in
-- Supabase → Table Editor → lw_errors. Reports hold technical details only (see js/errors.js).
-- ---------------------------------------------------------------------------
create table if not exists public.lw_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  app_version text not null check (char_length(app_version) <= 20),
  message     text not null check (char_length(message) <= 500),
  source      text check (char_length(source) <= 300),
  line        integer,
  col         integer,
  stack       text check (char_length(stack) <= 4000),
  user_agent  text check (char_length(user_agent) <= 300)
);

create index if not exists lw_errors_created on public.lw_errors (created_at desc);

alter table public.lw_errors enable row level security;

drop policy if exists "lw_errors insert" on public.lw_errors;
create policy "lw_errors insert" on public.lw_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

grant insert on public.lw_errors to anon, authenticated;
grant usage on sequence public.lw_errors_id_seq to anon, authenticated;

-- Error reports are capped and purged (audit D7, v0.20): at most 30 an hour per signed-in person and 300
-- an hour for all signed-out reports together; extra ones are dropped quietly (the app never retries).
-- created_at is always the server's time, so the cap can't be dodged. Reports older than 90 days are
-- deleted as new ones arrive. Safe to re-run.
create or replace function public.lw_errors_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  new.created_at := now();
  delete from public.lw_errors where created_at < now() - interval '90 days';
  if new.user_id is null then
    select count(*) into n from public.lw_errors where user_id is null and created_at > now() - interval '1 hour';
    if n >= 300 then return null; end if;
  else
    select count(*) into n from public.lw_errors where user_id = new.user_id and created_at > now() - interval '1 hour';
    if n >= 30 then return null; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.lw_errors_guard() from public, anon, authenticated;
drop trigger if exists lw_errors_guard on public.lw_errors;
create trigger lw_errors_guard before insert on public.lw_errors for each row execute function public.lw_errors_guard();

-- ---------------------------------------------------------------------------
-- M2: the user's own data (PRD §11). Every table below starts with the same five columns.
-- Weights are stored in kg and lengths in cm; the app converts for display.
-- ---------------------------------------------------------------------------

-- Profile: one row per person (id is always 'me').
create table if not exists public.lw_profiles (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (id = 'me'),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  dob                 date check (dob > '1900-01-01'),
  sex                 text check (sex in ('male', 'female', 'unspecified')),
  height_cm           numeric(5, 1) check (height_cm between 90 and 250),
  units               text not null default 'us' check (units in ('us', 'metric')),
  activity            text check (activity in ('sedentary', 'light', 'moderate', 'very', 'extreme')),
  training_per_week   smallint check (training_per_week between 0 and 21),
  body_fat_pct        numeric(4, 1) check (body_fat_pct > 0 and body_fat_pct < 70),
  body_fat_source     text check (body_fat_source in ('guess', 'scale', 'dexa', 'calipers', 'other')),
  use_body_fat        boolean not null default false,
  pregnant_or_breastfeeding boolean not null default false,
  alcohol_tracking    boolean not null default false,
  alcohol_limit       smallint check (alcohol_limit between 0 and 3),
  preferences         jsonb not null default '{}'::jsonb check (pg_column_size(preferences) < 16384),
  primary key (user_id, id)
);

-- ONB-10: numbers the user knows (a measured BMR/RMR or a known maintenance), used instead of the formula.
alter table public.lw_profiles add column if not exists known_bmr_kcal integer check (known_bmr_kcal between 800 and 4000);
alter table public.lw_profiles add column if not exists known_bmr_source text check (known_bmr_source in ('scan', 'calorimetry', 'other'));
alter table public.lw_profiles add column if not exists known_tdee_kcal integer check (known_tdee_kcal between 1000 and 6000);
alter table public.lw_profiles add column if not exists known_tdee_source text check (known_tdee_source in ('tracking', 'coach', 'other'));

-- Goal: what the user wants (PRD §4). Changes rarely; never deleted by changing it (PHS-3).
create table if not exists public.lw_goals (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  type        text not null check (type in ('lose-fat', 'build-muscle', 'recomp', 'maintain', 'nutrition')),
  started_on  date not null,
  ended_on    date check (ended_on is null or ended_on >= started_on),
  primary key (user_id, id)
);

-- Phase: the strategy being run now (PHS-1, PHS-2).
create table if not exists public.lw_phases (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  goal_id          text check (char_length(goal_id) <= 64),
  type             text not null check (type in ('cut', 'recomp', 'bulk', 'maintenance', 'nutrition')),
  start_date       date not null,
  end_date         date check (end_date is null or end_date >= start_date),
  planned_end      date,
  target_weight_kg numeric(5, 1) check (target_weight_kg between 20 and 400),
  rate             numeric(4, 2) check (rate between 0 and 10),
  calc_version     text not null check (char_length(calc_version) <= 20),
  primary key (user_id, id)
);

-- Target set: a versioned set of daily targets with an effective-from date (PHS-5).
create table if not exists public.lw_target_sets (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  phase_id        text not null check (char_length(phase_id) <= 64),
  effective_from  date not null,
  kcal            integer not null check (kcal between 500 and 10000),
  protein_g       integer not null check (protein_g between 0 and 1000),
  carbs_g         integer not null check (carbs_g between 0 and 2000),
  fat_g           integer not null check (fat_g between 0 and 1000),
  fiber_g         integer check (fiber_g between 0 and 200),
  micronutrients  jsonb not null default '{}'::jsonb check (pg_column_size(micronutrients) < 16384),
  origin          text not null check (origin in ('calculated', 'manual', 'recommendation')),
  calc_inputs     jsonb not null default '{}'::jsonb check (pg_column_size(calc_inputs) < 16384),
  calc_version    text not null check (char_length(calc_version) <= 20),
  primary key (user_id, id)
);

-- Custom food: the user's own foods (LOG-7). Nutrients per 100 g, keyed by nutrient id.
create table if not exists public.lw_custom_foods (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name               text not null check (char_length(name) between 1 and 200),
  brand              text check (char_length(brand) <= 200),
  barcode            text check (char_length(barcode) <= 32),
  nutrients_per_100g jsonb not null check (pg_column_size(nutrients_per_100g) < 16384),
  servings           jsonb not null default '[]'::jsonb check (pg_column_size(servings) < 16384),
  primary key (user_id, id)
);
-- Recipes (LOG-11, v0.19): a recipe is one of your foods plus its ingredients and finished weight.
alter table public.lw_custom_foods add column if not exists recipe jsonb;
alter table public.lw_custom_foods drop constraint if exists lw_custom_foods_recipe_size;
alter table public.lw_custom_foods add constraint lw_custom_foods_recipe_size check (recipe is null or pg_column_size(recipe) < 131072);

-- Saved meal: a named list of items (food ref, quantity, unit).
create table if not exists public.lw_saved_meals (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name   text not null check (char_length(name) between 1 and 200),
  items  jsonb not null check (pg_column_size(items) < 65536),
  primary key (user_id, id)
);

-- Diary entry: what was eaten, with the nutrients copied at log time (PRD §4 Intake), so later
-- corrections to a food don't rewrite history. Calories and macros are also real columns for charts.
create table if not exists public.lw_diary_entries (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  date        date not null,
  slot        text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snacks', 'beverages', 'supplements')),
  food_source text not null check (food_source in ('usda', 'off', 'custom', 'quick', 'meal')),
  food_ref    text check (char_length(food_ref) <= 64),
  name        text not null check (char_length(name) between 1 and 200),
  qty         numeric(8, 2) check (qty > 0),
  unit        text check (char_length(unit) <= 40),
  grams       numeric(8, 1) check (grams >= 0),
  kcal        numeric(7, 1) not null check (kcal between 0 and 20000),
  protein_g   numeric(6, 1) check (protein_g >= 0),
  carbs_g     numeric(6, 1) check (carbs_g >= 0),
  fat_g       numeric(6, 1) check (fat_g >= 0),
  alcohol_g   numeric(6, 1) check (alcohol_g >= 0),
  nutrients   jsonb not null default '{}'::jsonb check (pg_column_size(nutrients) < 16384),
  logged_via  text not null check (logged_via in ('search', 'recent', 'barcode', 'quick', 'meal', 'copy', 'ai')),
  primary key (user_id, id)
);

-- Weight: each weigh-in (MEA-1). `date` is the user's local day, used for "first weigh-in of the day".
create table if not exists public.lw_weights (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  measured_at timestamptz not null,
  date        date not null,
  kg          numeric(5, 2) not null check (kg between 20 and 400),
  source      text not null default 'manual' check (source in ('manual', 'health', 'import')),
  note        text check (char_length(note) <= 500),
  primary key (user_id, id)
);

-- Measurement: circumferences such as waist (MEA-3).
create table if not exists public.lw_measurements (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  date    date not null,
  site    text not null check (site in ('waist', 'hip', 'chest', 'neck', 'arm', 'thigh')),
  cm      numeric(5, 1) not null check (cm between 10 and 300),
  method  text check (char_length(method) <= 100),
  primary key (user_id, id)
);

-- Body-fat estimate (MEA-4), with how it was measured.
create table if not exists public.lw_body_fat (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  date    date not null,
  pct     numeric(4, 1) not null check (pct > 0 and pct < 70),
  method  text not null check (method in ('guess', 'scale', 'dexa', 'calipers', 'other')),
  primary key (user_id, id)
);

-- Lift: a key lift's top set (MEA-5). The estimated 1RM is worked out in the app (js/calc/strength.js).
create table if not exists public.lw_lifts (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  date       date not null,
  lift       text not null check (char_length(lift) between 1 and 100),
  weight_kg  numeric(6, 2) not null check (weight_kg > 0 and weight_kg < 1000),
  reps       smallint not null check (reps between 1 and 100),
  source     text not null default 'manual' check (source in ('manual', 'prforge')),
  primary key (user_id, id)
);

-- Recommendation: a suggested change with its reasoning; nothing changes until the user accepts (Phase 2).
create table if not exists public.lw_recommendations (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  phase_id    text check (char_length(phase_id) <= 64),
  type        text not null check (char_length(type) <= 40),
  proposed    jsonb not null check (pg_column_size(proposed) < 16384),
  reasoning   jsonb not null default '[]'::jsonb check (pg_column_size(reasoning) < 16384),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  decided_at  timestamptz,
  primary key (user_id, id)
);

-- Food report: "something's wrong with this food" (FDB). Reviewed by hand in the Table Editor.
create table if not exists public.lw_food_reports (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  food_source text not null check (food_source in ('usda', 'off', 'custom')),
  food_ref    text not null check (char_length(food_ref) <= 64),
  issue       text not null check (issue in ('wrong-nutrients', 'wrong-name', 'wrong-serving', 'duplicate', 'other')),
  note        text check (char_length(note) <= 1000),
  primary key (user_id, id)
);

alter table public.lw_profiles enable row level security;
alter table public.lw_goals enable row level security;
alter table public.lw_phases enable row level security;
alter table public.lw_target_sets enable row level security;
alter table public.lw_custom_foods enable row level security;
alter table public.lw_saved_meals enable row level security;
alter table public.lw_diary_entries enable row level security;
alter table public.lw_weights enable row level security;
alter table public.lw_measurements enable row level security;
alter table public.lw_body_fat enable row level security;
alter table public.lw_lifts enable row level security;
alter table public.lw_recommendations enable row level security;
alter table public.lw_food_reports enable row level security;

-- The server stamps updated_at on every insert and update.
create or replace function public.lw_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- user_id and created_at can't be changed after a row is made.
create or replace function public.lw_keep_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- The same triggers, index, policies and grants on every synced table.
do $$
declare
  t text;
  synced text[] := array['lw_profiles', 'lw_goals', 'lw_phases', 'lw_target_sets', 'lw_custom_foods', 'lw_saved_meals',
    'lw_diary_entries', 'lw_weights', 'lw_measurements', 'lw_body_fat', 'lw_lifts', 'lw_recommendations', 'lw_food_reports'];
begin
  foreach t in array synced loop
    execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_changed', t);

    execute format('drop trigger if exists lw_touch on public.%I', t);
    execute format('create trigger lw_touch before insert or update on public.%I for each row execute function public.lw_touch_updated_at()', t);
    execute format('drop trigger if exists lw_keep_owner on public.%I', t);
    execute format('create trigger lw_keep_owner before update on public.%I for each row execute function public.lw_keep_owner()', t);

    execute format('drop policy if exists "own rows: read" on public.%I', t);
    execute format('create policy "own rows: read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "own rows: add" on public.%I', t);
    execute format('create policy "own rows: add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "own rows: change" on public.%I', t);
    execute format('create policy "own rows: change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);

    -- Signed-in users can read, add and change (row level security limits them to their own rows).
    -- No delete: the app deletes with a tombstone. Signed-out visitors get nothing.
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Beta metrics (PRD §13, ACC-3). Counts only, worked out from rows that already exist: no food
-- names, no weights, no extra tracking in the app. For the owner, in Supabase → Table Editor →
-- lw_metrics (or: select * from public.lw_metrics). The app's roles can't read it.
--   users             people who finished setup
--   active_7d         of those, people who logged food or weighed in during the last 7 days
--   d7_eligible/kept  people who set up 14+ days ago / of those, active on days 7 to 13 after setup
--   d30_eligible/kept people who set up 37+ days ago / of those, active on days 30 to 36
--   logged_days_28d / two_meal_days_28d   person-days with food logged in the last 28 days / with 2+ meals
--   weighins_per_week_28d   average weigh-in days a week, last 28 days, people in a cut or lean bulk
--   entries_28d, via_*      diary entries in the last 28 days, by how they were logged
--   reports_per_1000        food reports per 1,000 diary entries, all time
-- ---------------------------------------------------------------------------
create or replace view public.lw_metrics with (security_invoker = true) as
with people as (
  select user_id, (created_at at time zone 'utc')::date as joined from public.lw_profiles where not deleted
), activity as (
  select user_id, date as day from public.lw_diary_entries where not deleted
  union
  select user_id, date from public.lw_weights where not deleted
), meal_days as (
  select user_id, date as day, count(distinct slot) as meals
  from public.lw_diary_entries where not deleted and date > current_date - 28 group by user_id, date
), movers as (
  select distinct user_id from public.lw_phases where not deleted and end_date is null and type in ('cut', 'bulk')
), weigh as (
  select w.user_id, count(distinct w.date)::numeric / 4 as per_week
  from public.lw_weights w join movers m using (user_id)
  where not w.deleted and w.date > current_date - 28 group by w.user_id
), recent as (
  select logged_via from public.lw_diary_entries where not deleted and date > current_date - 28
)
select
  (select count(*) from people) as users,
  (select count(distinct a.user_id) from activity a join people p using (user_id) where a.day > current_date - 7) as active_7d,
  (select count(*) from people where joined <= current_date - 14) as d7_eligible,
  (select count(*) from people p where p.joined <= current_date - 14
     and exists (select 1 from activity a where a.user_id = p.user_id and a.day between p.joined + 7 and p.joined + 13)) as d7_kept,
  (select count(*) from people where joined <= current_date - 37) as d30_eligible,
  (select count(*) from people p where p.joined <= current_date - 37
     and exists (select 1 from activity a where a.user_id = p.user_id and a.day between p.joined + 30 and p.joined + 36)) as d30_kept,
  (select count(*) from meal_days) as logged_days_28d,
  (select count(*) from meal_days where meals >= 2) as two_meal_days_28d,
  (select round(avg(per_week), 1) from weigh) as weighins_per_week_28d,
  (select count(*) from recent) as entries_28d,
  (select count(*) from recent where logged_via = 'search') as via_search,
  (select count(*) from recent where logged_via = 'recent') as via_recent,
  (select count(*) from recent where logged_via = 'barcode') as via_barcode,
  (select count(*) from recent where logged_via = 'quick') as via_quick,
  (select count(*) from recent where logged_via = 'meal') as via_meal,
  (select count(*) from recent where logged_via = 'copy') as via_copy,
  (select round(1000.0 * (select count(*) from public.lw_food_reports where not deleted)
     / nullif((select count(*) from public.lw_diary_entries where not deleted), 0), 1)) as reports_per_1000;
revoke all on public.lw_metrics from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Delete my account (ACC-1). Called by the signed-in person from the app. It removes their
-- sign-in record, and with it every row they own in every lw_ table (each table's user_id is
-- "on delete cascade"), plus their error reports. It can only ever delete the caller's own
-- account: it takes no arguments and uses auth.uid(). PR Forge is a separate project and is
-- not touched.
-- ---------------------------------------------------------------------------
create or replace function public.lw_delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from public.lw_errors where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.lw_delete_account() from public, anon;
grant execute on function public.lw_delete_account() to authenticated;


-- ---------------------------------------------------------------------------
-- M4: the shared food catalog (PRD §7). Filled by tools/food-import (a GitHub Actions workflow that
-- uses the database connection, not the app). The app can only read it and search it.
-- Nutrients are per 100 g (or 100 ml for drinks), keyed by Leanward nutrient ids (tools/food-import/usda.js).
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
grant usage on schema extensions to authenticated;   -- Supabase already does this; search needs it

create table if not exists public.lw_foods (
  id            text primary key check (char_length(id) between 3 and 64),
  source        text not null check (source in ('usda-foundation', 'usda-sr-legacy', 'usda-fndds', 'usda-branded')),
  source_id     text not null check (char_length(source_id) <= 32),
  verification  text not null default 'verified' check (verification in ('verified', 'community')),
  name          text not null check (char_length(name) between 1 and 300),
  brand         text check (char_length(brand) <= 200),
  gtin          text check (gtin ~ '^[0-9]{14}$'),
  category      text check (char_length(category) <= 200),
  kcal          numeric(7, 1) not null check (kcal between 0 and 1000),
  protein_g     numeric(6, 2) not null check (protein_g between 0 and 100),
  carbs_g       numeric(6, 2) not null check (carbs_g between 0 and 100),
  fat_g         numeric(6, 2) not null check (fat_g between 0 and 100),
  energy_derived boolean not null default false,
  per           text not null default 'g' check (per in ('g', 'ml')),
  serving_g     numeric(8, 2) check (serving_g > 0),
  serving_label text check (char_length(serving_label) <= 120),
  servings      jsonb not null default '[]'::jsonb,
  nutrients     jsonb not null default '{}'::jsonb,
  preparation   text check (preparation in ('raw', 'cooked')),
  published     date,
  imported_at   timestamptz not null default now(),
  search        tsvector generated always as (to_tsvector('english', name || ' ' || coalesce(brand, ''))) stored
);

create index if not exists lw_foods_search on public.lw_foods using gin (search);
create index if not exists lw_foods_name_trgm on public.lw_foods using gin (lower(name) extensions.gin_trgm_ops);
create unique index if not exists lw_foods_gtin on public.lw_foods (gtin) where gtin is not null;

alter table public.lw_foods enable row level security;
drop policy if exists "catalog readable" on public.lw_foods;
create policy "catalog readable" on public.lw_foods for select to authenticated using (true);
revoke all on public.lw_foods from anon, authenticated;
grant select on public.lw_foods to authenticated;

-- One row per import run, for the record (read in the Table Editor).
create table if not exists public.lw_food_imports (
  id         bigint generated always as identity primary key,
  dataset    text not null,
  release    text,
  rows_in    integer,
  rows_kept  integer,
  table_mb   numeric(8, 1),
  ran_at     timestamptz not null default now()
);
alter table public.lw_food_imports enable row level security;
revoke all on public.lw_food_imports from anon, authenticated;

-- Search (LOG-3, FDB-4, LOG-6): full-text matching on the name and brand, with a fuzzy (trigram)
-- fallback for typos. Every word matches as a prefix, so "greek yog" or "chob" find foods while you're
-- still typing; a trailing 's is dropped and other apostrophes removed ("kellogg's" = "kellogg"). The fuzzy pass runs only when the
-- full-text pass finds nothing, because on short text it is slow on the whole catalog. A common word's
-- matches are cut to the best 500 by a cheap score before the full ranking.
-- Ranking: text match; plain (USDA generic) foods before branded ones, unless the query names a brand
-- that isn't already in the food's name ("quest bar"); whole-word matches; names that start with the first word; raw
-- (or the preparation the query asks for); an exact name. Then shorter names. Near-identical name +
-- brand pairs are collapsed to the best one. The user's own foods and history come first in the app.
create or replace function public.lw_search_foods(q text, max_results integer default 25)
returns table (id text, source text, verification text, name text, brand text, gtin text, kcal numeric, protein_g numeric,
  carbs_g numeric, fat_g numeric, per text, serving_g numeric, serving_label text, preparation text, score real)
language sql stable security invoker set search_path = ''
as $$
  with words as (
    -- Words of 2+ letters or digits; one-letter words (a trailing "s", a half-typed letter) are left out.
    select array_agg(w order by n) as w
    from regexp_split_to_table(regexp_replace(regexp_replace(lower(coalesce(q, '')), '[''’`]s\M', '', 'g'), '[''’`]', '', 'g'), '[^a-z0-9]+') with ordinality as x(w, n)
    where char_length(w) >= 2
  ), qq as (
    select lower(btrim(q)) as t, words.w[1] as first,
      case when words.w is null then null else to_tsquery('english', array_to_string(array(select x || ':*' from unnest(words.w) x), ' & ')) end as tsq,
      array(select to_tsquery('english', x || ':*') from unnest(words.w) x) as each_word,
      case when words.w is null then null else to_tsquery('english', array_to_string(words.w, ' & ')) end as whole,
      case when lower(q) ~ '\m(cooked|boiled|baked|roasted|grilled|fried|steamed)\M' then 'cooked'
           when lower(q) ~ '\mraw\M' then 'raw' end as prep
    from words
  ), text_hits as (
    -- Common words ("apple") match tens of thousands of foods; a cheap first score keeps the best
    -- 500 (plain foods and whole-word matches first) before the full score below.
    select f.* from public.lw_foods f, qq where qq.tsq is not null and f.search @@ qq.tsq
    order by (case when f.source <> 'usda-branded' then 1 else 0 end) + (case when f.search @@ qq.whole then 0.5 else 0 end)
      + ts_rank(f.search, qq.tsq, 1) desc
    limit 500
  ), fuzzy_hits as (
    select f.* from public.lw_foods f, qq
    where char_length(qq.t) >= 4 and not exists (select 1 from text_hits) and qq.t operator(extensions.<%) lower(f.name)
  ), hits as (
    select h.*, (
        ts_rank(h.search, qq.tsq, 1) * 2
        + extensions.word_similarity(qq.t, lower(h.name))
        + case when h.verification = 'verified' then 0.3 else 0 end
        + case when bh.brand_hit then 0.9 when h.source <> 'usda-branded' then 0.8 else 0 end
        -- Whole words beat prefixes: "salmon" finds salmon before salmonberries.
        + case when h.search @@ qq.whole then 0.3 else 0 end
        + case when qq.first is not null and lower(h.name) like qq.first || '%' then 0.3 else 0 end
        + case when qq.prep is not null and h.preparation = qq.prep then 0.4
               when qq.prep is null and h.preparation = 'raw' then 0.2 else 0 end
        + case when lower(h.name) = qq.t then 0.5 else 0 end
      )::real as score
    from (select * from text_hits union all select * from fuzzy_hits) h
    cross join qq
    left join lateral (
      -- The query names this food's brand: a query word in the brand but not in the name.
      select coalesce(bool_or(to_tsvector('english', h.brand) @@ wq and not to_tsvector('english', h.name) @@ wq), false) as brand_hit
      from unnest(qq.each_word) wq where h.brand is not null
    ) bh on true
    where char_length(qq.t) >= 2
  ), ranked as (
    select h.*, row_number() over (partition by lower(h.name), lower(coalesce(h.brand, '')) order by h.score desc, h.published desc nulls last) as n
    from hits h
  )
  select r.id, r.source, r.verification, r.name, r.brand, r.gtin, r.kcal, r.protein_g, r.carbs_g, r.fat_g, r.per,
    r.serving_g, r.serving_label, r.preparation, r.score
  from ranked r where r.n = 1
  order by r.score desc, char_length(r.name), r.name
  limit least(greatest(coalesce(max_results, 25), 1), 50);
$$;

-- Barcode lookup (LOG-4). The app normalizes UPC-A/E and EAN-8/13 to GTIN-14 before calling.
create or replace function public.lw_food_by_barcode(gtin14 text)
returns setof public.lw_foods
language sql stable security invoker set search_path = ''
as $$ select * from public.lw_foods where gtin = gtin14 and gtin14 ~ '^[0-9]{14}$' limit 1; $$;

revoke all on function public.lw_search_foods(text, integer) from public, anon;
revoke all on function public.lw_food_by_barcode(text) from public, anon;
grant execute on function public.lw_search_foods(text, integer) to authenticated;
grant execute on function public.lw_food_by_barcode(text) to authenticated;
