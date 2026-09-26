-- ============================================================================
-- Shanel Foods — database setup
--
-- HOW TO USE: open your Supabase project, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and press Run.
-- Running it twice is safe — nothing is deleted or duplicated.
-- ============================================================================

-- Every table carries updated_at (so the newest change wins when two phones
-- edit at once) and deleted (a soft delete, so removals reach other phones).

create table if not exists staff (
  id          text primary key,
  name        text not null,
  role        text not null check (role in ('owner', 'dispatch', 'rider', 'accountant')),
  pin         text not null,
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists customers (
  id          text primary key,
  name        text not null,
  phone       text default '',
  address     text not null,
  landmark    text,
  notes       text,
  -- A Google Maps link the customer shared, plus its coordinates when the link
  -- contains them. More reliable for a rider than a typed address.
  map_link    text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists menu_items (
  id          text primary key,
  name        text not null,
  price       numeric(10, 2) not null default 0,
  category    text,
  available   boolean not null default true,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists orders (
  id            text primary key,
  customer_id   text not null,
  lines         jsonb not null default '[]'::jsonb,
  total         numeric(10, 2) not null default 0,
  status        text not null check (status in ('new', 'preparing', 'out', 'delivered', 'cancelled')),
  -- 'cod' and 'monthly' are the old names for cash and transfer; kept so rows
  -- written by earlier versions remain valid.
  payment       text not null check (payment in ('cash', 'upi', 'transfer', 'cod', 'monthly')),
  paid          boolean not null default false,
  rider_id      text,
  notes         text,
  date          date not null,
  source        text not null default 'manual' check (source in ('manual', 'subscription')),
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  delivered_by  text,
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false
);

-- Orders are almost always looked up by delivery day, or by rider for the day.
create index if not exists orders_date_idx on orders (date);
create index if not exists orders_rider_date_idx on orders (rider_id, date);

-- Company-wide settings, a single row. closed_days holds the weekdays the
-- kitchen is shut (0 = Sunday), so nothing is cooked or billed for them.
create table if not exists app_settings (
  id          text primary key,
  closed_days jsonb not null default '[0]'::jsonb,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- The delivery times in the day (morning, evening, and any added later). Kept as
-- rows rather than fixed in code so adding a lunch round is a setting.
create table if not exists meal_rounds (
  id          text primary key,
  name        text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- A standing arrangement: this customer gets these items on these weekdays.
create table if not exists subscriptions (
  id            text primary key,
  customer_id   text not null,
  lines         jsonb not null default '[]'::jsonb,
  days_of_week  jsonb not null default '[]'::jsonb,
  -- 'cod' and 'monthly' are the old names for cash and transfer; kept so rows
  -- written by earlier versions remain valid.
  payment       text not null check (payment in ('cash', 'upi', 'transfer', 'cod', 'monthly')),
  rider_id      text,
  notes         text,
  start_date    date not null,
  end_date      date,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false
);

-- One row per day a subscriber asked to be skipped. Kept as separate rows (not
-- a list on the subscription) so two people skipping different days at the same
-- time cannot overwrite each other's change.
create table if not exists subscription_skips (
  id               text primary key,
  subscription_id  text not null,
  date             date not null,
  reason           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted          boolean not null default false
);

create index if not exists skips_subscription_idx on subscription_skips (subscription_id, date);

-- A bill raised for a period, at the figure agreed with the customer. Weekly and
-- monthly customers are charged by these, not per delivery.
create table if not exists bills (
  id            text primary key,
  customer_id   text not null,
  period_start  date not null,
  period_end    date not null,
  amount        numeric(10, 2) not null default 0,
  note          text,
  raised_by     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false
);

create index if not exists bills_customer_idx on bills (customer_id, period_start);

-- Money received from a customer. Amounts rather than a paid/unpaid flag, which
-- is what makes part payments possible.
create table if not exists payments (
  id           text primary key,
  customer_id  text not null,
  date         date not null,
  amount       numeric(10, 2) not null default 0,
  method       text not null,
  note         text,
  recorded_by  text,
  /** Set when the payment came from a rider collecting cash on a delivery. */
  order_id     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

create index if not exists payments_customer_idx on payments (customer_id, date);

-- Money going out, so profit can be seen rather than only revenue.
create table if not exists expenses (
  id          text primary key,
  date        date not null,
  category    text not null,
  amount      numeric(10, 2) not null default 0,
  note        text,
  paid_by     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create index if not exists expenses_date_idx on expenses (date);

-- Cash a rider handed in to the office. What a rider collected and what they
-- have handed over are separate facts; the gap between them is the thing the
-- accountant actually needs to chase.
create table if not exists cash_handovers (
  id           text primary key,
  rider_id     text not null,
  date         date not null,
  amount       numeric(10, 2) not null default 0,
  note         text,
  received_by  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

create index if not exists handovers_rider_date_idx on cash_handovers (rider_id, date);

-- ----------------------------------------------------------------------------
-- Upgrades for databases created by an earlier version of this file.
--
-- "create table if not exists" above leaves an existing table untouched, so it
-- can never add a new column. These statements do that, and are harmless when
-- the column is already there.
-- ----------------------------------------------------------------------------

alter table customers add column if not exists map_link text;
alter table customers add column if not exists lat double precision;
alter table customers add column if not exists lng double precision;

-- Delivery rounds (morning / evening)
alter table orders        add column if not exists round_id text;
alter table subscriptions add column if not exists round_ids jsonb not null default '[]'::jsonb;
-- The price agreed for one billing period, captured when the pack is sold.
alter table subscriptions add column if not exists pack_amount numeric(10, 2);

-- Payment method was renamed: 'cod' -> 'cash', 'monthly' -> 'transfer', because
-- the old list mixed how money arrives with how often a customer is billed.
-- The original CHECK would reject the new values, so widen it to accept both.
do $$
declare
  t text;
  c text;
begin
  foreach t in array array['orders', 'subscriptions'] loop
    for c in
      select conname from pg_constraint
      where conrelid = format('public.%s', t)::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%payment%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c);
    end loop;
    execute format(
      'alter table public.%I add constraint %I check (payment in (''cash'', ''upi'', ''transfer'', ''cod'', ''monthly''))',
      t, t || '_payment_check'
    );
  end loop;
end $$;

-- How often a customer settles up
alter table customers add column if not exists billing_cycle text not null default 'daily';

create index if not exists orders_date_round_idx on orders (date, round_id);

-- Tell Supabase's API to notice the new columns straight away rather than
-- after its own cache expires.
notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Access rules
--
-- This is a private staff app: the four tables are opened to the app's "anon"
-- key, which is the key baked into the app your team installs. That means
-- anyone holding the app can read and write this data, so share the app only
-- with your own staff. If a phone is lost or someone leaves, rotate the key in
-- Supabase (Settings -> API -> Reset anon key) and rebuild the app.
-- ----------------------------------------------------------------------------

alter table staff              enable row level security;
alter table customers          enable row level security;
alter table menu_items         enable row level security;
alter table orders             enable row level security;
alter table subscriptions      enable row level security;
alter table subscription_skips enable row level security;
alter table expenses           enable row level security;
alter table cash_handovers     enable row level security;
alter table meal_rounds        enable row level security;
alter table bills              enable row level security;
alter table payments           enable row level security;
alter table app_settings       enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['staff', 'customers', 'menu_items', 'orders', 'subscriptions',
                     'subscription_skips', 'expenses', 'cash_handovers', 'meal_rounds',
                     'bills', 'payments', 'app_settings']) loop
    execute format('drop policy if exists app_access on public.%I', t);
    execute format(
      'create policy app_access on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Live updates: let phones hear about changes the moment they happen, so a new
-- order appears on the rider's phone without pulling to refresh.
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array['staff', 'customers', 'menu_items', 'orders', 'subscriptions',
                     'subscription_skips', 'expenses', 'cash_handovers', 'meal_rounds',
                     'bills', 'payments', 'app_settings']) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
