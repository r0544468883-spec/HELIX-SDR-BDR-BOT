// POST /api/inbound/gmail — cron-triggered inbound reader (secret-gated). For every
// workspace with a connected Gmail, reads recent replies, runs the objection-handler
// on each, and stores the classification + suggested follow-up strategy. This is the
// loop closing: the SDR now READS the replies and UNDERSTANDS the objection, instead
// of only sending. (Auto-drafting the follow-up per reply is the next step — it needs
// the thread→lead mapping.)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/helix/supabase';
import { getFreshAccessToken } from '@/lib/connectors/store';
import { listInbound } from '@/lib/connectors/gmail';
import { handleObjection } from '@/lib/agents/sdr/roles/objection-handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_SECRET;
  if (!secret || req.headers.get('x-inbound-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = supabaseAdmin();

  const { data: conns } = await db.from('connections').select('workspace_id').eq('provider', 'google');
  const workspaceIds = [...new Set((conns ?? []).map((c: { workspace_id: string }) => c.workspace_id))];

  const results: Array<{ workspaceId: string; read: number; classified: number }> = [];
  for (const ws of workspaceIds) {
    const token = await getFreshAccessToken(ws, 'google');
    if (!token) continue;

    const inbound = await listInbound(token).catch(() => []);
    let classified = 0;
    for (const m of inbound) {
      if (!m.text.trim()) continue;
      const objection = await handleObjection(m.text).catch(() => null);
      await db.from('inbound_replies').upsert(
        {
          workspace_id: ws,
          message_id: m.id,
          thread_id: m.threadId,
          from_addr: m.from,
          subject: m.subject,
          body: m.text.slice(0, 4000),
          objection_type: objection?.type ?? null,
          strategy: objection?.strategy ?? null,
        },
        { onConflict: 'workspace_id,message_id' },
      );
      if (objection) classified++;
    }
    results.push({ workspaceId: ws, read: inbound.length, classified });
  }

  return NextResponse.json({ ok: true, workspaces: results.length, results });
}
