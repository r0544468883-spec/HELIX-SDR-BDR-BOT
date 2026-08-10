// SDR binding of the autonomy switch to Supabase (service-role; API routes have no session).

import { supabaseAdmin } from '@/lib/helix/supabase';
import type { AutonomyStore } from './resolve';
import type { AutonomyMode } from './types';

export function adminStore(): AutonomyStore {
  const db = supabaseAdmin();
  return {
    async getSettings(workspaceId, featureKey) {
      const { data } = await db
        .from('autonomy_settings')
        .select('mode, risk_ack')
        .eq('workspace_id', workspaceId)
        .eq('feature_key', featureKey)
        .maybeSingle();
      return (data as { mode: AutonomyMode; risk_ack: boolean } | null) ?? null;
    },
  };
}
