// WhatsApp Cloud API webhook — inbound lead messages → AI auto-reply loop.
// GET  = Meta verification (hub.challenge).
// POST = incoming messages → handleInboundMessage (classify → draft → approve/auto).
// Register the webhook + subscribe the WABA to the "messages" field in the Meta app.
import { NextRequest, NextResponse } from 'next/server';
import { handleInboundMessage } from '@/lib/helix/inbound';
import { resolveWorkspaceForChannel } from '@/lib/helix/workspace';
import { resolveOperatorWorkspace, handleOperatorCommand } from '@/lib/bot/operator';
import { sendWhatsApp } from '@/lib/channels/whatsapp';
import { supabaseAdmin } from '@/lib/helix/supabase';
import { applyButtonAction } from '@/lib/lifecycle/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- Verification handshake ---
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const mode = p.get('hub.mode');
  const token = p.get('hub.verify_token');
  const challenge = p.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

interface WaWebhook {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: {
          from?: string; id?: string; type?: string; text?: { body?: string };
          button?: { payload?: string; text?: string };
          interactive?: { button_reply?: { id?: string } };
        }[];
      };
    }[];
  }[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WaWebhook;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        for (const m of value?.messages ?? []) {
          if (!m.from) continue;

          // QUICK-REPLY button tap (template quick_reply / interactive) → self-describing
          // payload → confirm/cancel appointment or reorder. No workspace lookup needed.
          const payload = m.button?.payload ?? m.interactive?.button_reply?.id;
          if (payload) {
            const reply = await applyButtonAction(payload);
            if (reply) {
              const { data: b } = await supabaseAdmin().from('channel_bindings').select('config').eq('channel', 'whatsapp').limit(1).maybeSingle();
              await sendWhatsApp((b?.config ?? {}) as Record<string, unknown>, m.from, reply);
            }
            continue;
          }

          const text = m.text?.body;
          if (!text) continue; // skip non-text (media/status) for now

          // Is the sender a linked OPERATOR? → run operator commands, not the lead flow.
          const opWorkspace = await resolveOperatorWorkspace('whatsapp', m.from);
          if (opWorkspace) {
            const reply = await handleOperatorCommand({ workspaceId: opWorkspace, text });
            const { data: b } = await supabaseAdmin().from('channel_bindings').select('config').eq('workspace_id', opWorkspace).eq('channel', 'whatsapp').maybeSingle();
            await sendWhatsApp((b?.config ?? {}) as Record<string, unknown>, m.from, reply);
            continue;
          }

          const workspaceId = await resolveWorkspaceForChannel(
            'whatsapp',
            phoneNumberId ? { key: 'phone_number_id', value: phoneNumberId } : undefined,
          );
          if (!workspaceId) continue;

          await handleInboundMessage({
            workspaceId, channel: 'whatsapp', from: m.from, text, externalId: m.id,
          });
        }
      }
    }
    return NextResponse.json({ ok: true }); // always 200 so Meta doesn't retry-storm
  } catch (error) {
    console.error('[webhooks/whatsapp] error:', error);
    return NextResponse.json({ ok: true });
  }
}
