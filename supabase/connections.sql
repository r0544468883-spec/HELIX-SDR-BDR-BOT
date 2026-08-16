-- Per-workspace external connections (OAuth tokens). Isolated by RLS; only the
-- service role (server) reads/writes. One row per (workspace, provider).
create table if not exists connections (
  workspace_id uuid not null,
  provider     text not null,            -- 'google' (Gmail), later: 'microsoft', 'linkedin'
  access_token text not null,
  refresh_token text,
  expires_at   timestamptz not null,
  email        text,
  updated_at   timestamptz default now(),
  primary key (workspace_id, provider)
);

alter table connections enable row level security;
-- No public policies: tokens are server-only (service-role bypasses RLS).
