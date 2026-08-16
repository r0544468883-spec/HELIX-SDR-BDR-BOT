-- HELIX SDR-BDR-BOT — Agency → Client hierarchy (white-label)
-- sdr runs as a service-role bot backend (no user-facing memberships/RLS), so this
-- only adds the parent link + a share token + branding inheritance. Access control
-- stays at the app/service layer (see lib/helix/workspace.ts routing).
-- Run once in the Supabase SQL editor.

alter table workspaces add column if not exists parent_workspace_id uuid references workspaces(id) on delete set null;
alter table workspaces add column if not exists report_token text;
create index if not exists workspaces_parent_idx on workspaces(parent_workspace_id);
create unique index if not exists workspaces_report_token_idx on workspaces(report_token) where report_token is not null;

-- Child inherits the agency's brand unless it set its own.
create or replace function resolve_branding(ws uuid)
returns jsonb language sql stable as $$
  select coalesce(nullif(child.branding, '{}'::jsonb), parent.branding, '{}'::jsonb)
  from workspaces child
  left join workspaces parent on parent.id = child.parent_workspace_id
  where child.id = ws;
$$;
