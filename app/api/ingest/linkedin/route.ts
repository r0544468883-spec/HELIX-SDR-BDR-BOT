// LinkedIn inbound ingest — LinkedIn has NO official messaging API, so a browser
// extension / session bridge (PLUG) captures inbound DMs/InMail and POSTs them here.
// Secret-gated. Feeds the SAME AI reply engine as the other channels; the drafted
// reply is enqueued for the extension to deliver back (see /api/linkedin/outbox).
// Body: { workspace_id?, from, text, external_id?, name? }
import { NextRequest, NextResponse } from 'next/server';
import { handleInboundMessage } from '@/lib/helix/inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.EXECUTOR_SECRET;
  const provided = request.nextUrl.searchParams.get('secret') || request.headers.get('x-ingest-secret');
  if (secret && provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const b = await request.json().catch(() => null);
  const workspaceId = b?.workspace_id || process.env.DEFAULT_WORKSPACE_ID;
  if (!workspaceId || !b?.from || !b?.text) {
    return NextResponse.json({ error: 'workspace_id, from, text required' }, { status: 400 });
  }
  await handleInboundMessage({ workspaceId, channel: 'linkedin', from: b.from, text: b.text, externalId: b.external_id });
  return NextResponse.json({ ok: true });
}
