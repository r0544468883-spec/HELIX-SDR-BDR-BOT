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

-- Custom, user-uploaded templates — the workspace defines its OWN templates for
-- any message type instead of (or on top of) our built-in catalogs. `definition`
-- holds the shape per kind (whatsapp: TemplateDef · email: {subject,body,...}).
-- A custom row with the same key as a built-in OVERRIDES it in the merged view.
create table if not exists custom_templates (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,                         -- 'whatsapp' | 'email'
  key text not null,                          -- logical key (overrides a built-in with same key)
  definition jsonb not null,                  -- the template shape (per kind)
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (workspace_id, kind, key)
);
create index if not exists idx_custom_tpl on custom_templates(workspace_id, kind, active);

-- Canned / quick replies — instant FAQ answers to common INBOUND inquiries
-- (price/hours/address/availability). In-window free text → no Meta template needed.
-- Custom rows here override/extend the code defaults in lib/canned/catalog.ts.
create table if not exists canned_replies (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  key text not null,                          -- 'price' | 'hours' | ...
  title text,
  body text not null,
  triggers text[] default '{}',               -- keywords that match an inbound message
  active boolean default true,
  created_at timestamptz default now(),
  unique (workspace_id, key)
);
create index if not exists idx_canned_ws on canned_replies(workspace_id, active);

-- One-time passcodes for WhatsApp AUTHENTICATION templates (customer verification).
create table if not exists otp_codes (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  consumed boolean default false,
  attempts int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_otp_lookup on otp_codes(workspace_id, phone, consumed);

-- Operator↔workspace link: which chat identity (phone / telegram chat_id / email)
-- is an OPERATOR of a workspace, so the bot routes their messages to operator
-- commands (schedule / import / stats) instead of the lead auto-reply flow.
create table if not exists bot_links (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel text not null,                      -- whatsapp | telegram | email
  identifier text not null,                   -- phone (E.164) / chat_id / email
  role text default 'operator',               -- operator | admin
  created_at timestamptz default now(),
  unique (channel, identifier)
);
create index if not exists idx_bot_links_lookup on bot_links(channel, identifier);

alter table lifecycle_customers enable row level security;
alter table appointments        enable row level security;
alter table purchases           enable row level security;
alter table coupons             enable row level security;
alter table lifecycle_jobs      enable row level security;
alter table bot_links           enable row level security;
alter table otp_codes           enable row level security;
alter table canned_replies      enable row level security;
alter table custom_templates    enable row level security;
do $$ begin
  create policy "auth all canned" on canned_replies for all to authenticated using (true) with check (true);
  create policy "auth all custom_tpl" on custom_templates for all to authenticated using (true) with check (true);
  create policy "auth all lc_customers" on lifecycle_customers for all to authenticated using (true) with check (true);
  create policy "auth all appointments" on appointments for all to authenticated using (true) with check (true);
  create policy "auth all purchases"    on purchases for all to authenticated using (true) with check (true);
  create policy "auth all coupons"      on coupons for all to authenticated using (true) with check (true);
  create policy "auth all lc_jobs"      on lifecycle_jobs for all to authenticated using (true) with check (true);
  create policy "auth all bot_links"    on bot_links for all to authenticated using (true) with check (true);
  create policy "auth all otp_codes"    on otp_codes for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
