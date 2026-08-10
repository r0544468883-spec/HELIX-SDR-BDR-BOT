// POST /api/act/trigger — cross-product hook (Phase 4). Lets the HELIX Dashboards
// hub nudge SDR to move its pipeline: dispatch approved outreach and send due
// lifecycle reminders. Secret-gated (x-cross-act-secret).
// SAFETY: both cores act only on items the SDR switch already cleared — runExecutor
// sends APPROVED queue items, runLifecycle sends scheduled reminders. No new cold
// outbound is initiated here.
import { NextRequest, NextResponse } from 'next/server';
import { runExecutor } from '@/lib/helix/executor';
import { runLifecycle } from '@/lib/lifecycle/run';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.CROSS_ACT_SECRET;
  if (!secret || req.headers.get('x-cross-act-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const executor = await runExecutor();
  const lifecycle = await runLifecycle();
  return NextResponse.json({ ok: true, executor, lifecycle });
}
