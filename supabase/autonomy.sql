-- HELIX Autonomy Switch — SDR install. See helix/PRODUCTS/AUTONOMY-SWITCH-SPEC.md.
-- Safe default: absent row => advisor. SDR reuses approval_queue for the 'approve'
-- path, so we only add the settings table here (no separate autonomy_actions).
-- RLS matches this repo's permissive "auth all" pattern (see approval_queue).

create table if not exists autonomy_settings (
  workspace_id  uuid not null,
  feature_key   text not null,
  mode          text not null default 'advisor'
                check (mode in ('advisor','approve','autopilot')),
  risk_ack      boolean not null default false,
  daily_cap     int,
  updated_by    uuid,
  updated_at    timestamptz default now(),
  primary key (workspace_id, feature_key)
);

alter table autonomy_settings enable row level security;

do $$ begin
  create policy "auth all autonomy" on autonomy_settings for all
    to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
