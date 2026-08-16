// Google OAuth (self-hosted, direct) — Gmail send + read, so an SDR agent can send
// outreach AS the user's own mailbox and READ the replies (closing the loop with the
// objection-handler). Mirrors the ecosystem's gsc-oauth pattern: plain fetch, env
// creds, no SDK. Tokens are stored per-workspace (lib/connectors/store).
const SCOPE = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events', // book meetings / read free-busy
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export function buildAuthUrl(state = ''): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state, // = workspaceId
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`token_${res.status}`);
  return (await res.json()) as TokenResponse;
}

export async function refreshToken(refresh: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`refresh_${res.status}`);
  return (await res.json()) as TokenResponse;
}

/** The connected mailbox address (for display + the From). */
export async function connectedEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { email?: string };
  return j.email ?? null;
}
