// Resolve which workspace an inbound event belongs to.
// V1: match the channel binding (e.g. WhatsApp phone_number_id) → fall back to DEFAULT_WORKSPACE_ID.
// Multi-tenant hardening (per-token routing) comes later.
import { supabaseAdmin } from './supabase';

export async function resolveWorkspaceForChannel(
  channel: string,
  configMatch?: { key: string; value: string },
): Promise<string | null> {
  const db = supabaseAdmin();
  if (configMatch) {
    const { data } = await db
      .from('channel_bindings')
      .select('workspace_id, config')
      .eq('channel', channel);
    const hit = (data ?? []).find(
      (r) => (r.config as Record<string, unknown>)?.[configMatch.key] === configMatch.value,
    );
    if (hit) return hit.workspace_id as string;
  }
  return process.env.DEFAULT_WORKSPACE_ID ?? null;
}
