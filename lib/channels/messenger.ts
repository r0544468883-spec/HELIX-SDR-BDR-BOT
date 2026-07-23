// Facebook Messenger — send a Page message to a user (PSID). Config: { access_token }.
// Standard messaging works inside the 24h window; outside it needs a message tag.
import type { ChannelConfig, SendResult } from './types';

const GRAPH = 'https://graph.facebook.com/v21.0';

export async function sendMessenger(config: ChannelConfig, to: string, content: string): Promise<SendResult> {
  const token = config.access_token as string | undefined;
  if (!token) return { ok: false, error: 'messenger_not_configured' };
  try {
    const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipient: { id: to }, messaging_type: 'RESPONSE', message: { text: content } }),
    });
    const json = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `messenger_${res.status}` };
    return { ok: true, externalId: json.message_id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
