// WhatsApp Cloud API — send + interactive reply-buttons for approvals.
// ⚠️ Proactive (business-initiated) messages need an OPEN 24h window OR an approved
// template. Interactive buttons work inside the 24h window. Outside it → template first.
// For proactive HITL pings prefer Telegram/email (no window); WhatsApp is opt-in/warm.
import type { ChannelConfig, SendResult, ApprovalButtons } from './types';

const GRAPH = 'https://graph.facebook.com/v21.0';

export async function sendWhatsApp(config: ChannelConfig, to: string, content: string): Promise<SendResult> {
  const token = config.access_token as string | undefined;
  const phoneId = config.phone_number_id as string | undefined;
  if (!token || !phoneId) return { ok: false, error: 'whatsapp_not_configured' };
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: content } }),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `whatsapp_${res.status}` };
    return { ok: true, externalId: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** NOTIFY + ASK via WhatsApp interactive buttons (must be inside the 24h window). */
export async function sendWhatsAppApproval(
  config: ChannelConfig,
  to: string,
  content: string,
  buttons: ApprovalButtons,
): Promise<SendResult> {
  const token = config.access_token as string | undefined;
  const phoneId = config.phone_number_id as string | undefined;
  if (!token || !phoneId) return { ok: false, error: 'whatsapp_not_configured' };
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: content },
          action: {
            buttons: [
              { type: 'reply', reply: { id: buttons.approveData, title: buttons.approveLabel.slice(0, 20) } },
              { type: 'reply', reply: { id: buttons.rejectData, title: buttons.rejectLabel.slice(0, 20) } },
            ],
          },
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `whatsapp_${res.status}` };
    return { ok: true, externalId: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
