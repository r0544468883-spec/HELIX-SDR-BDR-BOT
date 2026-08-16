// GET /api/connect/linkedin?workspaceId=... — start the LinkedIn OAuth flow.
import { NextRequest, NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/connectors/linkedin-oauth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId') ?? '';
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  return NextResponse.redirect(buildAuthUrl(workspaceId));
}
