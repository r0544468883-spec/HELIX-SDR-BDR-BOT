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
-- HITL notify-and-approve loop (spec §Screen 7 Approval Queue + Conversation Ops)
-- ═══════════════════════════════════════════════════════════════

-- Where the user wants to be pinged, and which channel binding to use.
create table if not exists channel_bindings (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel text not null,                 -- 'telegram' | 'whatsapp' | 'email'
  identifier text not null,              -- telegram chat_id / WA phone (E.164) / email address
  config jsonb default '{}'::jsonb,       -- bot_token / access_token+phone_number_id / from
  verified boolean default false,
  created_at timestamptz default now(),
  unique (workspace_id, channel)
);

create table if not exists notification_prefs (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  channels text[] default array['telegram','email'],  -- push order; TG/email are window-free
  digest_time text default '08:00',                    -- batched fallback (timezone-aware later)
  per_event boolean default true                       -- true = ping immediately, not just digest
);

-- The queue of actions awaiting human approval + the notify status of each.
create table if not exists approval_queue (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,                    -- 'reply_comment' | 'send_message' | 'send_sequence_step' | 'engage_post'
  title text not null,                   -- "פוסט חדש של X שכדאי להגיב אליו"
  body text,                             -- the drafted content the user is approving
  target_ref text,                       -- external id (comment_id / thread_id / post url)
  channel text,                          -- execution channel of the action itself
  status text default 'pending',         -- pending | notified | approved | rejected | executed | failed
  notified_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz default now()
);

alter table channel_bindings   enable row level security;
alter table notification_prefs enable row level security;
alter table approval_queue     enable row level security;
create policy "auth all bindings" on channel_bindings   for all to authenticated using (true) with check (true);
create policy "auth all prefs"    on notification_prefs  for all to authenticated using (true) with check (true);
create policy "auth all approvals" on approval_queue     for all to authenticated using (true) with check (true);
create index if not exists idx_approval_ws_status on approval_queue(workspace_id, status);

-- ═══════════════════════════════════════════════════════════════
-- Unibox foundation — one thread per conversation, messages in/out (spec §3.4)
-- ═══════════════════════════════════════════════════════════════
create table if not exists threads (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  channel text,                          -- last channel used
  external_ref text,                     -- lead's phone / chat_id / email
  classification text,                   -- interested | objection | question | not-now | spam
  stage text default 'new',              -- new→discovery→proposal→dark→ghost→won/lost
  last_inbound_at timestamptz,           -- opens the WA 24h window
  created_at timestamptz default now(),
  unique (workspace_id, channel, external_ref)
);

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references threads(id) on delete cascade,
  channel text not null,
  direction text not null,               -- 'in' | 'out'
  body text,
  external_id text,
  created_at timestamptz default now()
);

alter table threads  enable row level security;
alter table messages enable row level security;
create policy "auth all threads"  on threads  for all to authenticated using (true) with check (true);
create policy "auth all messages" on messages for all to authenticated using (true) with check (true);
create index if not exists idx_threads_ws on threads(workspace_id);
create index if not exists idx_messages_thread on messages(thread_id);

-- ═══════════════════════════════════════════════════════════════
-- Conversation Memory (RAG) — spec §3.3.6. Learn from the user's past replies so the
-- AI answers in their voice + content, and improves over time (not generic).
-- embedding dim = 768 (Ollama nomic-embed-text). Change if you use another embed model.
-- ═══════════════════════════════════════════════════════════════
create table if not exists conversation_memory (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  question text not null,                -- an inbound message we handled
  answer text not null,                  -- the reply the user sent / approved
  embedding vector(768),                 -- of `question`
  source_thread_id uuid references threads(id) on delete set null,
  style_tags text[],
  success_score numeric default 0,       -- bumped when the exchange led to a positive outcome
  times_used integer default 0,          -- how often recalled to ground a new reply
  created_at timestamptz default now()
);
alter table conversation_memory enable row level security;
create policy "auth all convmem" on conversation_memory for all to authenticated using (true) with check (true);
create index if not exists idx_convmem_ws on conversation_memory(workspace_id);

-- Similarity search (cosine). Called via supabase.rpc('match_conversation_memory', ...).
create or replace function match_conversation_memory(
  p_workspace uuid,
  p_query vector(768),
  p_k int default 3
) returns table(id uuid, question text, answer text, similarity float)
language sql stable as $$
  select id, question, answer, 1 - (embedding <=> p_query) as similarity
  from conversation_memory
  where workspace_id = p_workspace and embedding is not null
  order by embedding <=> p_query
  limit p_k;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Product 02 (HELIX Dashboards) connection:
--   Metrics are PUSHED to Product 02, not pulled. See lib/helix/dashboards.ts.
--   Later slices add: signals, mentions, sequences, threads, messages,
--   message_variants, conversation_memory (pgvector), suppression, consent.
-- ═══════════════════════════════════════════════════════════════
