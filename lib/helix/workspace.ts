// Resolve which workspace an inbound event belongs to.
// Order: (1) explicit channel binding match → (2) routing token binding →
// (3) DEFAULT_WORKSPACE_ID fallback. The fallback is the single-tenant crutch;
// once channel_bindings are populated it is never reached. In production, reaching
// it logs a warning so misrouted/multi-tenant traffic is visible, and `strict`
// callers can refuse it entirely.
import { supabaseAdmin } from './supabase';

let warned = false;

/** The env fallback workspace — centralized so it can be hardened in one place. */
export function defaultWorkspace(strict = false): string | null {
  const id = process.env.DEFAULT_WORKSPACE_ID ?? null;
  if (strict) return null; // strict callers must resolve a real binding
  if (id && process.env.NODE_ENV === 'production' && !warned) {
    warned = true;
    console.warn('[workspace] falling back to DEFAULT_WORKSPACE_ID — configure channel_bindings for real multi-tenant routing');
  }
  return id;
}

export async function resolveWorkspaceForChannel(
  channel: string,
  configMatch?: { key: string; value: string },
  opts?: { strict?: boolean },
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
  return defaultWorkspace(opts?.strict);
}

/** Resolve a workspace from an inbound routing token (e.g. a per-tenant webhook token). */
export async function resolveWorkspaceForToken(token?: string | null): Promise<string | null> {
  if (!token) return defaultWorkspace();
  const db = supabaseAdmin();
  const { data } = await db
    .from('channel_bindings')
    .select('workspace_id, config')
    .eq('channel', 'token');
  const hit = (data ?? []).find((r) => (r.config as Record<string, unknown>)?.token === token);
  return hit ? (hit.workspace_id as string) : defaultWorkspace();
}
