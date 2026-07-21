// Telegram Bot API — send + approval buttons (inline_keyboard) + callback ack.
// Best channel for proactive HITL pings: no 24h window, native buttons.
import type { ChannelConfig, SendResult, ApprovalButtons } from './types';

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export async function sendTelegram(config: ChannelConfig, content: string): Promise<SendResult> {
  const token = config.bot_token as string | undefined;
  const chatId = config.chat_id as string | undefined;
  if (!token || !chatId) return { ok: false, error: 'telegram_not_configured' };
  try {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: content }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number } };
    if (!res.ok || !json.ok) return { ok: false, error: `telegram_${res.status}` };
    return { ok: true, externalId: String(json.result?.message_id ?? '') };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** NOTIFY + ASK: message with [approve]/[reject] inline buttons. Button taps arrive at the webhook. */
export async function sendTelegramApproval(
  config: ChannelConfig,
  content: string,
  buttons: ApprovalButtons,
): Promise<SendResult> {
  const token = config.bot_token as string | undefined;
  const chatId = config.chat_id as string | undefined;
  if (!token || !chatId) return { ok: false, error: 'telegram_not_configured' };
  try {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: content,
        reply_markup: {
          inline_keyboard: [[
            { text: buttons.approveLabel, callback_data: buttons.approveData },
            { text: buttons.rejectLabel, callback_data: buttons.rejectData },
          ]],
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number } };
    if (!res.ok || !json.ok) return { ok: false, error: `telegram_${res.status}` };
    return { ok: true, externalId: String(json.result?.message_id ?? '') };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Acknowledge a button press (removes the "loading" spinner) + optional toast. */
export async function answerCallback(token: string, callbackId: string, text?: string): Promise<void> {
  try {
    await fetch(API(token, 'answerCallbackQuery'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text: text ?? '' }),
    });
  } catch { /* best-effort */ }
}
