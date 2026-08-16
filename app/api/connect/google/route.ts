// GET /api/connect/google?workspaceId=... — start the Gmail OAuth flow.
import { NextRequest, NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/connectors/google-oauth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId') ?? '';
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  return NextResponse.redirect(buildAuthUrl(workspaceId));
}
