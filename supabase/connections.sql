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

-- Inbound replies read from the connected mailbox, classified by the objection-handler.
create table if not exists inbound_replies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  message_id    text not null,
  thread_id     text,
  from_addr     text,
  subject       text,
  body          text,
  objection_type text,                   -- price | timing | competitor | not_interested | need_info | positive | other
  strategy      text,                    -- the follow-up angle the objection-handler chose
  created_at    timestamptz default now(),
  unique (workspace_id, message_id)
);
alter table inbound_replies enable row level security;
