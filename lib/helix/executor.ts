// HELIX SDR-BDR-BOT — executor. Runs approval_queue items the user APPROVED.
// Closes the loop: approve → send the action to the lead → mark executed.
// Reuses the workspace's own channel_bindings (bot/sender config).
import { supabaseAdmin } from './supabase';
import { sendEmail } from '@/lib/channels/email';
import { sendWhatsApp } from '@/lib/channels/whatsapp';
import { sendTelegram } from '@/lib/channels/telegram';
import { sendMessenger } from '@/lib/channels/messenger';
import type { SendResult } from '@/lib/channels/types';

// §30A: cold WhatsApp/SMS in Israel is blocked. Approvals for those channels should never
// be enqueued cold; this is a defensive backstop at execution time.
const BLOCKED_COLD = new Set<string>(); // e.g. add 'whatsapp' to hard-block cold WA at exec time

interface QueueRow {
  id: string;
  workspace_id: string;
  kind: string;
  body: string | null;
  target_ref: string | null;   // recipient: email / E.164 phone / chat_id
  channel: string | null;      // 'email' | 'whatsapp' | 'telegram'
}

/** Execute one approved action against the lead. */
async function dispatch(row: QueueRow, config: Record<string, unknown>): Promise<SendResult> {
  const to = row.target_ref ?? '';
  const content = row.body ?? '';
  if (!to || !content) return { ok: false, error: 'missing_target_or_body' };
  if (row.channel && BLOCKED_COLD.has(row.channel)) return { ok: false, error: 'channel_blocked_by_compliance' };

  switch (row.channel) {
    case 'email':
      return sendEmail({ ...config, recipients: [to] }, content);
    case 'whatsapp':
      return sendWhatsApp(config, to, content);
    case 'telegram':
      return sendTelegram({ ...config, chat_id: to }, content);
    case 'messenger':
      return sendMessenger(config, to, content);
    default:
      return { ok: false, error: `no_executor_for_${row.channel}` };
  }
}

/** Process all approved items (oldest first). Wire to a Cron, or call right after approval. */
export async function runExecutor(limit = 25): Promise<{ executed: number; failed: number }> {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from('approval_queue')
    .select('id, workspace_id, kind, body, target_ref, channel')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(limit);

  let executed = 0;
  let failed = 0;
  for (const row of (rows ?? []) as QueueRow[]) {
    // Load the workspace's sender config for this channel.
    const { data: binding } = await db
      .from('channel_bindings')
      .select('config')
      .eq('workspace_id', row.workspace_id)
      .eq('channel', row.channel ?? '')
      .maybeSingle();

    const result = await dispatch(row, (binding?.config ?? {}) as Record<string, unknown>);
    await db
      .from('approval_queue')
      .update({ status: result.ok ? 'executed' : 'failed' })
      .eq('id', row.id)
      .eq('status', 'approved'); // idempotent
    if (result.ok) executed++; else failed++;
  }
  return { executed, failed };
}
