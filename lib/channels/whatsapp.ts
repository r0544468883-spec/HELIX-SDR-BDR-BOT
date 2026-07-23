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

/**
 * Send an APPROVED WhatsApp template — the compliant way to open a conversation
 * proactively (outside the 24h window). `params` fill the body {{1}},{{2}}… in order.
 * `urlButtonParam` fills a dynamic URL button suffix (e.g. the confirm/cancel token).
 */
export async function sendWhatsAppTemplate(
  config: ChannelConfig,
  to: string,
  templateName: string,
  language: string,
  params: string[],
  urlButtonParam?: string,
  quickReplyPayloads?: string[],
): Promise<SendResult> {
  const token = config.access_token as string | undefined;
  const phoneId = config.phone_number_id as string | undefined;
  if (!token || !phoneId) return { ok: false, error: 'whatsapp_not_configured' };
  const components: Record<string, unknown>[] = [];
  if (params.length) {
    components.push({ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t })) });
  }
  if (urlButtonParam) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: urlButtonParam }] });
  }
  // QUICK_REPLY buttons: each carries a self-describing payload the webhook reads back.
  (quickReplyPayloads ?? []).forEach((payload, i) => {
    components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload }] });
  });
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: templateName, language: { code: language }, ...(components.length ? { components } : {}) },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `whatsapp_${res.status}` };
    return { ok: true, externalId: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Register (create) a message template on the WABA. Idempotent-ish: 409/duplicate is treated as OK. */
export async function createWhatsAppTemplate(
  config: ChannelConfig,
  wabaId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; status?: string }> {
  const token = config.access_token as string | undefined;
  if (!token) return { ok: false, error: 'whatsapp_not_configured' };
  try {
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string; code?: number } };
    if (!res.ok) {
      // Duplicate template name → already exists → fine for our sync purpose.
      if (json.error?.message?.toLowerCase().includes('already exists')) return { ok: true, status: 'exists' };
      return { ok: false, error: json.error?.message ?? `waba_${res.status}` };
    }
    return { ok: true, id: json.id, status: json.status };
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
