-- ============================================================
-- AUGUSTA STARTER — DATABASE SETUP
-- ============================================================
-- How to use this file:
-- 1. In your Supabase project, click "SQL Editor" in the left sidebar
-- 2. Click "New query"
-- 3. Paste this WHOLE file in
-- 4. Click "Run"
-- That's it — this creates all 4 tables the app needs, plus
-- some starter example data so the app isn't empty on first load.
-- ============================================================

-- Table 1: the list of chores and how often they repeat
create table chores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room text,                          -- e.g. "Kitchen" (optional)
  frequency_type text not null,       -- 'interval_days' | 'weekly_on_days' | 'monthly_on_day'
  frequency_interval_days int,        -- used when frequency_type = 'interval_days'
  frequency_weekdays int[],           -- used when frequency_type = 'weekly_on_days'. 0=Sunday...6=Saturday
  frequency_day_of_month int,         -- used when frequency_type = 'monthly_on_day'
  notes text,
  last_completed_at timestamptz,      -- gets updated every time someone marks it done
  created_at timestamptz default now()
);

-- Table 2: a history log, one row per time a chore was completed
create table chore_completions (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid references chores(id) on delete cascade,
  completed_at timestamptz default now(),
  completed_by text                   -- e.g. "Camille" (optional, just a text label)
);

-- Table 3: household supplies you want to keep an eye on
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,                      -- e.g. "Cleaning", "Bathroom" (optional)
  status text not null default 'ok',  -- 'ok' | 'low' | 'out'
  last_restocked_at timestamptz,
  notes text
);

-- Table 4: a shared "please buy this" grocery list
create table grocery_requests (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  note text,
  requested_by text,
  status text not null default 'requested', -- 'requested' | 'purchased'
  created_at timestamptz default now()
);

-- ============================================================
-- SECURITY — Row Level Security (RLS)
-- ============================================================
-- By default Supabase blocks all access until you explicitly
-- allow it. The policies below allow anyone with your app's link
-- to read AND write data — that's what lets your household use
-- it without logging in. Only use this pattern for low-stakes,
-- private-link apps like this one (see README for more on this).

alter table chores enable row level security;
alter table chore_completions enable row level security;
alter table inventory_items enable row level security;
alter table grocery_requests enable row level security;

create policy "public access" on chores for all using (true) with check (true);
create policy "public access" on chore_completions for all using (true) with check (true);
create policy "public access" on inventory_items for all using (true) with check (true);
create policy "public access" on grocery_requests for all using (true) with check (true);

-- ============================================================
-- STARTER EXAMPLE DATA (optional — delete this block if you'd
-- rather start with a completely empty app)
-- ============================================================

insert into chores (name, room, frequency_type, frequency_interval_days, frequency_weekdays, frequency_day_of_month, notes) values
  ('Sanitize kitchen counters', 'Kitchen', 'interval_days', 7, null, null, null),
  ('Take out recycling', 'Whole House', 'weekly_on_days', null, array[2,5], null, null),
  ('Sweep and vacuum', 'Whole House', 'interval_days', 7, null, null, null),
  ('Replace toilet tank pod', 'Bathroom', 'interval_days', 60, null, null, null),
  ('Run the dishwasher', 'Kitchen', 'interval_days', 2, null, null, null);

insert into inventory_items (name, category, status) values
  ('Trash bags', 'Cleaning', 'ok'),
  ('Toilet paper', 'Bathroom', 'low'),
  ('Mop pads', 'Cleaning', 'ok');

insert into grocery_requests (item_name, note, requested_by, status) values
  ('Mustard', 'the honey mustard kind', 'Camille', 'requested');
