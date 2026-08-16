// Per-workspace connection store. Tokens live in Supabase (RLS-isolated), never in
// the agent. getFreshAccessToken refreshes a near-expired token and persists the new
// one, so callers always get a live token. Schema: supabase/connections.sql.
import { supabaseAdmin } from '@/lib/helix/supabase';
import { refreshToken, type TokenResponse } from './google-oauth';

export interface Connection {
  workspace_id: string;
  provider: string; // 'google'
  access_token: string;
  refresh_token: string | null;
  expires_at: string; // ISO
  email: string | null;
}

export async function saveConnection(
  workspaceId: string,
  provider: string,
  tokens: TokenResponse,
  email: string | null,
): Promise<void> {
  const db = supabaseAdmin();
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  await db.from('connections').upsert(
    {
      workspace_id: workspaceId,
      provider,
      access_token: tokens.access_token,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      expires_at: expiresAt,
      email,
    },
    { onConflict: 'workspace_id,provider' },
  );
}

export async function getConnection(workspaceId: string, provider: string): Promise<Connection | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('connections')
    .select('workspace_id, provider, access_token, refresh_token, expires_at, email')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .maybeSingle();
  return (data as Connection) ?? null;
}

/** Always-live access token: refreshes + persists when the stored one is near expiry. */
export async function getFreshAccessToken(workspaceId: string, provider = 'google'): Promise<string | null> {
  const conn = await getConnection(workspaceId, provider);
  if (!conn) return null;

  const stillValid = new Date(conn.expires_at).getTime() > Date.now() + 30_000;
  if (stillValid) return conn.access_token;

  if (!conn.refresh_token) return conn.access_token; // no refresh token — return what we have
  try {
    const fresh = await refreshToken(conn.refresh_token);
    await saveConnection(workspaceId, provider, { ...fresh, refresh_token: fresh.refresh_token ?? conn.refresh_token }, conn.email);
    return fresh.access_token;
  } catch {
    return null;
  }
}
