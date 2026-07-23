// Facebook Messenger webhook — inbound Page DMs → the same AI auto-reply engine
// as WhatsApp/Telegram (handleInboundMessage supports channel 'messenger').
// GET = Meta verification. POST = messaging events.
// Register + subscribe the Page to the "messages" field in the Meta app.
import { NextRequest, NextResponse } from 'next/server';
import { handleInboundMessage } from '@/lib/helix/inbound';
import { resolveWorkspaceForChannel } from '@/lib/helix/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

interface FbWebhook {
  object?: string;
  entry?: {
    id?: string; // page id
    messaging?: {
      sender?: { id?: string };
      message?: { mid?: string; text?: string; is_echo?: boolean };
    }[];
  }[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FbWebhook;
    for (const entry of body.entry ?? []) {
      const pageId = entry.id;
      for (const ev of entry.messaging ?? []) {
        const text = ev.message?.text;
        const from = ev.sender?.id;
        if (!from || !text || ev.message?.is_echo) continue; // skip echoes/non-text

        const workspaceId = await resolveWorkspaceForChannel(
          'messenger',
          pageId ? { key: 'page_id', value: pageId } : undefined,
        );
        if (!workspaceId) continue;

        await handleInboundMessage({ workspaceId, channel: 'messenger', from, text, externalId: ev.message?.mid });
      }
    }
    return NextResponse.json({ ok: true }); // always 200 so Meta doesn't retry-storm
  } catch (error) {
    console.error('[webhooks/messenger] error:', error);
    return NextResponse.json({ ok: true });
  }
}
