// LinkedIn OAuth (self-hosted, direct) — so an SDR agent can post a social touch AS
// the user (the channel-selector already routes some prospects to 'linkedin'). Same
// pattern as google-oauth: plain fetch, env creds, tokens stored per-workspace under
// provider 'linkedin' (lib/connectors/store). LinkedIn access tokens are long-lived
// (~60d) so there's no google-style short refresh loop here.
const SCOPE = [
  'openid', // → /v2/userinfo gives the member `sub` for the author URN
  'profile',
  'email',
  'w_member_social', // create posts on the member's behalf
].join(' ');

export function buildAuthUrl(state = ''): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI ?? '',
    scope: SCOPE,
    state, // = workspaceId
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export interface LinkedInToken {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

export async function exchangeCode(code: string): Promise<LinkedInToken> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI ?? '',
    }),
  });
  if (!res.ok) throw new Error(`li_token_${res.status}`);
  return (await res.json()) as LinkedInToken;
}

/** The connected member: `sub` becomes the author URN (urn:li:person:{sub}), plus name/email for display. */
export async function connectedMember(accessToken: string): Promise<{ sub: string; email?: string; name?: string } | null> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { sub?: string; email?: string; name?: string };
  return j.sub ? { sub: j.sub, email: j.email, name: j.name } : null;
}
