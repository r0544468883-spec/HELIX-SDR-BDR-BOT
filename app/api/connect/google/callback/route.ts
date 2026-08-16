// GET /api/connect/google/callback — Google redirects here with ?code&state.
// Exchanges the code, stores the per-workspace tokens, redirects back.
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, connectedEmail } from '@/lib/connectors/google-oauth';
import { saveConnection } from '@/lib/connectors/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const workspaceId = req.nextUrl.searchParams.get('state') ?? '';
  if (!code || !workspaceId) return NextResponse.json({ error: 'missing_code_or_state' }, { status: 400 });
  try {
    const tokens = await exchangeCode(code);
    const email = await connectedEmail(tokens.access_token);
    await saveConnection(workspaceId, 'google', tokens, email);
    return NextResponse.redirect(new URL(`/?connected=google&email=${encodeURIComponent(email ?? '')}`, req.url));
  } catch {
    return NextResponse.json({ error: 'oauth_failed' }, { status: 502 });
  }
}
