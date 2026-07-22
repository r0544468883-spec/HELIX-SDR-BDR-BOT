-- HELIX SDR — Lifecycle & Reminders engine.
-- Capabilities (abstracted from a real vet/pet brief): appointment reminders
-- (advance + same-day, with confirm/cancel), subscription renewal reminders,
-- replenishment/repeat-purchase reminders (by last-purchase cadence), birthday/
-- anniversary offers, coupon injection, and customer import (personal + a linked
-- secondary entity, e.g. a pet, via free-form `fields`). Delivery via WhatsApp
-- (+ the bot's other channels), driven by the customer's own data.

create extension if not exists "uuid-ossp";

-- Existing customers (distinct from prospecting `contacts`). `fields` holds any
-- custom data — personal details + a secondary entity (pet name / pet birthday / …).
create table if not exists lifecycle_customers (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text,
  phone text,                               -- E.164 for WhatsApp
  email text,
  birthday date,
  fields jsonb default '{}'::jsonb,          -- {pet_name, pet_birthday, plan, ...}
  source text,
  created_at timestamptz default now()
);
create index if not exists idx_lc_customers_ws on lifecycle_customers(workspace_id);

create table if not exists appointments (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_id uuid references lifecycle_customers(id) on delete cascade,
  title text,
  scheduled_at timestamptz not null,
  status text default 'pending',             -- pending | confirmed | cancelled
  token text unique,                         -- for the confirm/cancel link
  created_at timestamptz default now()
);

create table if not exists purchases (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_id uuid references lifecycle_customers(id) on delete cascade,
  product text,
  purchased_at timestamptz default now(),
  replenish_days int,                        -- cadence for the repeat-purchase reminder
  created_at timestamptz default now()
);

create table if not exists coupons (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  code text not null,
  benefit text,
  active boolean default true,
  created_at timestamptz default now()
);

-- One row per scheduled outbound message. The cron sends those that are due.
create table if not exists lifecycle_jobs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_id uuid references lifecycle_customers(id) on delete cascade,
  kind text not null,                        -- appt_reminder | appt_sameday | renewal | replenish | birthday | custom
  channel text default 'whatsapp',
  send_at timestamptz not null,
  status text default 'scheduled',           -- scheduled | sent | failed | cancelled
  meta jsonb default '{}'::jsonb,            -- {appt_token, coupon, product, date, who}
  external_id text,
  created_at timestamptz default now()
);
create index if not exists idx_lc_jobs_due on lifecycle_jobs(status, send_at);

alter table lifecycle_customers enable row level security;
alter table appointments        enable row level security;
alter table purchases           enable row level security;
alter table coupons             enable row level security;
alter table lifecycle_jobs      enable row level security;
do $$ begin
  create policy "auth all lc_customers" on lifecycle_customers for all to authenticated using (true) with check (true);
  create policy "auth all appointments" on appointments for all to authenticated using (true) with check (true);
  create policy "auth all purchases"    on purchases for all to authenticated using (true) with check (true);
  create policy "auth all coupons"      on coupons for all to authenticated using (true) with check (true);
  create policy "auth all lc_jobs"      on lifecycle_jobs for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
