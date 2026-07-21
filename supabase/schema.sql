-- ═══════════════════════════════════════════════════════════════
-- HELIX SDR-BDR-BOT — core schema (V1 vertical slice)
-- Standalone Supabase project. Mirrors the spec data model (§Data Model).
-- Run once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";
create extension if not exists vector;      -- pgvector, for conversation_memory (§3.3.6)

-- ── workspaces (multi-tenant; agencies) ───────────────────────────
create table if not exists workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  plan text default 'free',
  branding jsonb default '{}'::jsonb,
  compliance_config jsonb default '{}'::jsonb,
  trust_level text default 'founder',        -- founder | growth | pro (HITL trust ladder)
  created_at timestamptz default now()
);

-- ── accounts (company / buying-committee layer, sits ABOVE contacts) ─
create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  domain text,
  name text,
  industry text,
  size text,
  data_json jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ── contacts ──────────────────────────────────────────────────────
create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  name text,
  company text,
  domain text,
  title text,
  linkedin_url text,
  source text,                               -- how this contact entered
  status text default 'new',
  created_at timestamptz default now()
);

-- ── enrichment_fields (per-field waterfall result, own-first) ─────
create table if not exists enrichment_fields (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid not null references contacts(id) on delete cascade,
  field text not null,                       -- e.g. work_email, mobile, title
  value text,
  confidence numeric,                        -- 0..1
  resolved_by text,                          -- 'scrape' | 'permutation+verify' | 'registry' | 'apollo' ...
  source text,                               -- URL / provider, for GDPR source transparency
  cost numeric default 0,                    -- charge-on-hit; 0 for own-layer
  verified_at timestamptz,
  expires_at timestamptz,                    -- freshness / decay
  is_stale boolean default false,
  created_at timestamptz default now(),
  unique (contact_id, field)
);

-- ── enrichment_providers (waterfall config, own-first ordering) ───
create table if not exists enrichment_providers (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  field text not null,
  provider_order text[] not null,            -- ['cache','scrape','permutation','registry','apollo']
  byo_keys jsonb default '{}'::jsonb         -- BYO-key: customer's own Apollo/Lusha keys
);

-- ── RLS (per-workspace isolation) ─────────────────────────────────
alter table workspaces          enable row level security;
alter table accounts            enable row level security;
alter table contacts            enable row level security;
alter table enrichment_fields   enable row level security;
alter table enrichment_providers enable row level security;

-- NOTE: policies assume a workspace_members table / JWT claim. Placeholder
-- open-to-authenticated policies for the V1 slice — TIGHTEN before prod.
create policy "auth read workspaces"  on workspaces  for select to authenticated using (true);
create policy "auth all accounts"     on accounts    for all to authenticated using (true) with check (true);
create policy "auth all contacts"     on contacts    for all to authenticated using (true) with check (true);
create policy "auth all enrichment"   on enrichment_fields    for all to authenticated using (true) with check (true);
create policy "auth all providers"    on enrichment_providers for all to authenticated using (true) with check (true);

-- ── indexes ───────────────────────────────────────────────────────
create index if not exists idx_contacts_ws       on contacts(workspace_id);
create index if not exists idx_contacts_account  on contacts(account_id);
create index if not exists idx_enrich_contact    on enrichment_fields(contact_id);
create index if not exists idx_accounts_domain   on accounts(workspace_id, domain);

-- ═══════════════════════════════════════════════════════════════
-- Product 02 (HELIX Dashboards) connection:
--   Metrics are PUSHED to Product 02, not pulled. See lib/helix/dashboards.ts.
--   Later slices add: signals, mentions, sequences, threads, messages,
--   message_variants, conversation_memory (pgvector), suppression, consent.
-- ═══════════════════════════════════════════════════════════════
