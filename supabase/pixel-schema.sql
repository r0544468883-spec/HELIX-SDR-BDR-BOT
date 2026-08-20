-- ============================================================================
-- HELIX PIXEL — self-contained schema. Drops into ANY HELIX app's Supabase.
-- No dependency on the CRM or any other product. Every HELIX system embeds
-- helix.js and collects into its own copy of these three tables.
-- Spec: helix/PRODUCTS/15-helix-pixel.md
-- Run once per app's Supabase project. Safe to re-run (idempotent).
-- ============================================================================

-- 1) raw events (append-only).
create table if not exists public.pixel_events (
  id            bigint generated always as identity primary key,
  workspace_id  text not null default 'default',
  visitor_id    text not null,
  contact_email text,                              -- null until identity resolution (marketing consent)
  session_id    text,
  event         text not null,
  url           text,
  referrer      text,
  props         jsonb not null default '{}'::jsonb,
  consent       jsonb not null default '{}'::jsonb,
  device        jsonb not null default '{}'::jsonb,
  ts            timestamptz not null default now()
);
create index if not exists pixel_events_ws_ts_idx      on public.pixel_events (workspace_id, ts desc);
create index if not exists pixel_events_ws_visitor_idx on public.pixel_events (workspace_id, visitor_id);
create index if not exists pixel_events_email_idx      on public.pixel_events (contact_email) where contact_email is not null;

-- 2) visitors (identity + live intent score).
create table if not exists public.pixel_visitors (
  visitor_id    text primary key,
  workspace_id  text not null default 'default',
  contact_email text,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  intent_score  numeric not null default 0,        -- 0..100, real-time (decayed)
  intent_tier   text not null default 'cold',       -- cold | warm | hot
  signals       jsonb not null default '{}'::jsonb,
  company       jsonb,                              -- de-anon B2B (phase 3, approve-gated)
  consent       jsonb not null default '{}'::jsonb
);
create index if not exists pixel_visitors_ws_score_idx on public.pixel_visitors (workspace_id, intent_score desc);
create index if not exists pixel_visitors_email_idx    on public.pixel_visitors (contact_email) where contact_email is not null;

-- 3) consent audit trail (תיקון 13).
create table if not exists public.pixel_consent (
  id           bigint generated always as identity primary key,
  workspace_id text not null default 'default',
  visitor_id   text not null,
  analytics    boolean not null default false,
  marketing    boolean not null default false,
  granted_at   timestamptz not null default now(),
  ip_hash      text,           -- hash only, never raw IP
  policy_ver   text
);
create index if not exists pixel_consent_ws_visitor_idx on public.pixel_consent (workspace_id, visitor_id, granted_at desc);

-- RLS: writes come from the server (service_role, bypasses RLS). Reads are done
-- server-side via the service_role key in each app's own dashboard, so we keep
-- RLS enabled with NO public policies (deny-by-default to anon/authenticated).
alter table public.pixel_events   enable row level security;
alter table public.pixel_visitors enable row level security;
alter table public.pixel_consent  enable row level security;
