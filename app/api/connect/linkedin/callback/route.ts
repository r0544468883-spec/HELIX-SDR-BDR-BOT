// GET /api/connect/linkedin/callback — LinkedIn redirects here with ?code&state.
// Exchanges the code, stores the per-workspace token under provider 'linkedin'.
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, connectedMember } from '@/lib/connectors/linkedin-oauth';
import { saveConnection } from '@/lib/connectors/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const workspaceId = req.nextUrl.searchParams.get('state') ?? '';
  if (!code || !workspaceId) return NextResponse.json({ error: 'missing_code_or_state' }, { status: 400 });
  try {
    const tokens = await exchangeCode(code);
    const me = await connectedMember(tokens.access_token);
    await saveConnection(workspaceId, 'linkedin', tokens, me?.email ?? null);
    return NextResponse.redirect(new URL(`/?connected=linkedin&name=${encodeURIComponent(me?.name ?? '')}`, req.url));
  } catch {
    return NextResponse.json({ error: 'oauth_failed' }, { status: 502 });
  }
}
