// HELIX SDR-BDR-BOT — per-event NOTIFY + HITL approval dispatcher.
//
// The loop the user asked for:
//   TRIGGER (something needs approval — new inbound msg / post to reply to / drafted outreach)
//     → enqueueApproval() writes it to approval_queue
//       → notifyApproval() pushes "you have X — [approve][reject]" to the user's channel(s)
//         → user taps a button → app/api/webhooks/<channel> flips status → executes
//
// NOTE: this pushes to the OPERATOR (our user), not the end-customer. Telegram + email are
// window-free (best for proactive pings); WhatsApp needs an open 24h window / template.
import { supabaseAdmin } from './supabase';
import type { ApprovalButtons } from '@/lib/channels/types';
import { sendTelegramApproval } from '@/lib/channels/telegram';
import { sendEmailApproval } from '@/lib/channels/email';
import { sendWhatsAppApproval } from '@/lib/channels/whatsapp';

export interface ApprovalInput {
  workspaceId: string;
  kind: 'reply_comment' | 'send_message' | 'send_sequence_step' | 'engage_post';
  title: string;          // human summary — "פוסט חדש של X שכדאי להגיב אליו"
  body?: string;          // the drafted content being approved
  targetRef?: string;     // external id to act on
  channel?: string;       // execution channel of the action
}

/** Enqueue an item needing approval AND fire the per-event notification. Returns the queue id. */
export async function enqueueApproval(input: ApprovalInput): Promise<string | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('approval_queue')
    .insert({
      workspace_id: input.workspaceId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      target_ref: input.targetRef ?? null,
      channel: input.channel ?? null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !data) {
    console.warn('[notify] enqueue failed:', error?.message);
    return null;
  }
  await notifyApproval(input.workspaceId, data.id as string, input.title, input.body ?? '');
  return data.id as string;
}

/** Push a NOTIFY+ASK message with approve/reject buttons to the user's preferred channels. */
export async function notifyApproval(
  workspaceId: string,
  approvalId: string,
  title: string,
  body: string,
): Promise<void> {
  const db = supabaseAdmin();

  const { data: prefs } = await db
    .from('notification_prefs')
    .select('channels, per_event')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  // Default to telegram+email (window-free) when no prefs row exists.
  const channels: string[] = prefs?.per_event === false ? [] : (prefs?.channels ?? ['telegram', 'email']);
  if (channels.length === 0) return; // digest-only mode — the daily digest will carry it

  const { data: bindings } = await db
    .from('channel_bindings')
    .select('channel, identifier, config')
    .eq('workspace_id', workspaceId)
    .in('channel', channels);

  const text = body ? `${title}\n\n${body}` : title;
  const buttons: ApprovalButtons = {
    approveLabel: '✅ אשר ושלח',
    rejectLabel: '✋ דחה',
    approveData: `approve:${approvalId}`,
    rejectData: `reject:${approvalId}`,
  };

  let anySent = false;
  for (const b of bindings ?? []) {
    const cfg = (b.config ?? {}) as Record<string, unknown>;
    let ok = false;
    if (b.channel === 'telegram') {
      ok = (await sendTelegramApproval({ ...cfg, chat_id: b.identifier }, text, buttons)).ok;
    } else if (b.channel === 'email') {
      ok = (await sendEmailApproval({ ...cfg, recipients: [b.identifier], subject: title }, text, buttons)).ok;
    } else if (b.channel === 'whatsapp') {
      ok = (await sendWhatsAppApproval(cfg, b.identifier, text, buttons)).ok;
    }
    anySent = anySent || ok;
  }

  if (anySent) {
    await db.from('approval_queue').update({ status: 'notified', notified_at: new Date().toISOString() }).eq('id', approvalId);
  }
}

/** Called by the channel webhooks when the user taps a button. Returns the new status. */
export async function decideApproval(approvalId: string, decision: 'approve' | 'reject'): Promise<'approved' | 'rejected' | null> {
  const db = supabaseAdmin();
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const { error } = await db
    .from('approval_queue')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', approvalId)
    .in('status', ['pending', 'notified']); // idempotent: ignore double-taps
  if (error) {
    console.warn('[notify] decide failed:', error.message);
    return null;
  }
  // On approve, the executor (Cron / immediate) picks up status='approved' and runs the action.
  return status;
}
