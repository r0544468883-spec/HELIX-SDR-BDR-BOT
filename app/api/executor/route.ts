// GET /api/executor?secret=... — runs approved actions. Wire to a Cron (e.g. every 2 min).
// Also callable immediately after an approval for near-real-time send.
import { NextRequest, NextResponse } from 'next/server';
import { runExecutor } from '@/lib/helix/executor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.EXECUTOR_SECRET;
  const provided = request.nextUrl.searchParams.get('secret');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runExecutor();
  return NextResponse.json({ ok: true, ...result });
}
