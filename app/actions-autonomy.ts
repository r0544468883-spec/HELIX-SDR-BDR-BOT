'use server';

import { supabaseAdmin } from '@/lib/helix/supabase';
import type { AutonomyMode } from '@/lib/autonomy/types';

// SDR is operator-run (the approvals dashboard uses the service-role client and no
// per-user auth). We scope the switch to the first workspace, matching that model.
async function firstWorkspace(): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  return (data?.id as string) ?? null;
}

export async function setAutonomyMode(featureKey: string, mode: AutonomyMode, riskAck: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ws = await firstWorkspace();
  if (!ws) return { error: 'no_workspace' };
  const db = supabaseAdmin();
  const { error } = await db.from('autonomy_settings').upsert(
    { workspace_id: ws, feature_key: featureKey, mode, risk_ack: riskAck, updated_at: new Date().toISOString() },
    { onConflict: 'workspace_id,feature_key' },
  );
  return error ? { error: error.message } : { ok: true };
}
