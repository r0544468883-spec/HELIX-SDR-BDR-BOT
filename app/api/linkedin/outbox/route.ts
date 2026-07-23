// LinkedIn outbox — the PLUG extension/session bridge polls this for approved
// LinkedIn replies to deliver (no LinkedIn send API), then marks each as sent.
//   GET  ?secret=&workspace=   → pending approved LinkedIn sends
//   POST { id, secret }        → mark one as delivered (status → executed)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/helix/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authed(request: NextRequest, provided?: string | null): boolean {
  const secret = process.env.EXECUTOR_SECRET;
  return !secret || provided === secret;
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (!authed(request, p.get('secret') || request.headers.get('x-ingest-secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = supabaseAdmin();
  let q = db.from('approval_queue')
    .select('id, workspace_id, body, target_ref')
    .eq('status', 'approved').eq('channel', 'linkedin')
    .order('created_at', { ascending: true }).limit(25);
  const ws = p.get('workspace');
  if (ws) q = q.eq('workspace_id', ws);
  const { data } = await q;
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null);
  if (!authed(request, b?.secret || request.headers.get('x-ingest-secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!b?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = supabaseAdmin();
  await db.from('approval_queue').update({ status: 'executed' }).eq('id', b.id).eq('channel', 'linkedin').eq('status', 'approved');
  return NextResponse.json({ ok: true });
}
