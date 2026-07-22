// GET /api/lifecycle/cron?secret=... — sends all due lifecycle reminders.
// Wire to a Cron (e.g. every 15 min). Reuses EXECUTOR_SECRET for auth.
import { NextRequest, NextResponse } from 'next/server';
import { runLifecycle } from '@/lib/lifecycle/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.EXECUTOR_SECRET;
  const provided = request.nextUrl.searchParams.get('secret');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runLifecycle();
  return NextResponse.json({ ok: true, ...result });
}
