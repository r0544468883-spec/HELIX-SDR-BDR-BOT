// Telegram webhook — closes the HITL loop: user taps [approve]/[reject] → decide → confirm.
// Register once: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/webhooks/telegram
import { NextRequest, NextResponse } from 'next/server';
import { decideApproval } from '@/lib/helix/notify';
import { runExecutor } from '@/lib/helix/executor';
import { answerCallback, sendTelegram } from '@/lib/channels/telegram';
import { resolveOperatorWorkspace, handleOperatorCommand } from '@/lib/bot/operator';

export const runtime = 'nodejs';

interface TgUpdate {
  callback_query?: {
    id: string;
    data?: string;                 // "approve:<uuid>" | "reject:<uuid>"
    message?: { chat?: { id?: number }; message_id?: number };
  };
  message?: { chat?: { id?: number }; text?: string };
}

export async function POST(request: NextRequest) {
  try {
    const update = (await request.json()) as TgUpdate;

    // Operator text command (not a button tap) → route to operator handler.
    const msg = update.message;
    if (msg?.text && msg.chat?.id) {
      const chatId = String(msg.chat.id);
      const workspaceId = await resolveOperatorWorkspace('telegram', chatId);
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (workspaceId && token) {
        const reply = await handleOperatorCommand({ workspaceId, text: msg.text });
        await sendTelegram({ bot_token: token, chat_id: chatId }, reply);
      }
      return NextResponse.json({ ok: true });
    }

    const cb = update.callback_query;
    if (!cb?.data) return NextResponse.json({ ok: true }); // ignore non-button updates for now

    const [action, approvalId] = cb.data.split(':');
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if ((action === 'approve' || action === 'reject') && approvalId) {
      const decision = action === 'approve' ? 'approve' : 'reject';
      const status = await decideApproval(approvalId, decision);
      const toast = status === 'approved' ? 'אושר ✅ — שולח' : status === 'rejected' ? 'נדחה ✋' : 'כבר טופל';
      if (token) await answerCallback(token, cb.id, toast);
      if (status === 'approved') await runExecutor(); // near-real-time send

    } else if (token) {
      await answerCallback(token, cb.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[webhooks/telegram] error:', error);
    return NextResponse.json({ ok: true }); // always 200 so Telegram doesn't retry-storm
  }
}
