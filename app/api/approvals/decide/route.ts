// POST /api/approvals/decide { id, decision } — dashboard approve/reject → executor.
import { NextRequest, NextResponse } from 'next/server';
import { decideApproval } from '@/lib/helix/notify';
import { runExecutor } from '@/lib/helix/executor';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { id, decision } = await request.json();
  if (!id || (decision !== 'approve' && decision !== 'reject')) {
    return NextResponse.json({ error: 'id and decision (approve|reject) required' }, { status: 400 });
  }
  const status = await decideApproval(id, decision);
  if (status === 'approved') await runExecutor();
  return NextResponse.json({ ok: true, status });
}
