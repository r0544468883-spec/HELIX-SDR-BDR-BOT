// HELIX SDR-BDR-BOT — inbound message handler.
// TRIGGER: a lead replies on WhatsApp/Telegram/Messenger →
//   store → classify → (unless spam) draft reply →
//     trust ladder:  founder/growth → enqueue for approval (notify user with buttons)
//                    pro            → auto-approve + send immediately
import { supabaseAdmin } from './supabase';
import { enqueueApproval } from './notify';
import { runExecutor } from './executor';
import { classifyIntent, draftReply } from '@/lib/agent/inbound';
import { recallSimilar, rememberExchange } from './memory';
import { matchCannedForWorkspace } from '@/lib/canned/store';

export interface InboundMessage {
  workspaceId: string;
  channel: 'whatsapp' | 'telegram' | 'messenger';
  from: string;          // lead's phone / chat_id / psid
  text: string;
  externalId?: string;
}

export async function handleInboundMessage(msg: InboundMessage): Promise<void> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  // 1) Upsert thread (opens the WA 24h service window via last_inbound_at).
  const { data: thread } = await db
    .from('threads')
    .upsert(
      { workspace_id: msg.workspaceId, channel: msg.channel, external_ref: msg.from, last_inbound_at: now },
      { onConflict: 'workspace_id,channel,external_ref' },
    )
    .select('id')
    .single();
  if (!thread) return;
  const threadId = thread.id as string;

  // 2) Store the inbound message.
  await db.from('messages').insert({
    thread_id: threadId, channel: msg.channel, direction: 'in', body: msg.text, external_id: msg.externalId ?? null,
  });

  // 3) Classify intent (cheap/fast). Never auto-answer spam.
  const intent = await classifyIntent(msg.text);
  await db.from('threads').update({ classification: intent }).eq('id', threadId);
  if (intent === 'spam') return;

  // 4) Draft a grounded reply using recent history.
  const { data: history } = await db
    .from('messages')
    .select('direction, body')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(12);
  // 4a) Canned/quick reply — deterministic FAQ answer for common inquiries
  // (price/hours/address/…). Fast, consistent, and free (no LLM). If it matches,
  // use it verbatim; otherwise fall through to the grounded AI draft.
  const canned = await matchCannedForWorkspace(msg.workspaceId, msg.text);
  let reply: string | null;
  if (canned) {
    reply = canned.body;
  } else {
    // Conversation Memory (RAG §3.3.6): ground the reply in how we answered similar messages.
    const examples = await recallSimilar(msg.workspaceId, msg.text, 3);
    reply = await draftReply(
      msg.text,
      (history ?? []) as { direction: 'in' | 'out'; body: string }[],
      intent,
      examples.map((e) => ({ question: e.question, answer: e.answer })),
    );
  }
  if (!reply) return;

  // Learn from this exchange so future replies improve (not generic).
  await rememberExchange(msg.workspaceId, msg.text, reply, threadId);

  // 5) Trust ladder → approve-loop vs auto-send.
  const { data: ws } = await db.from('workspaces').select('trust_level').eq('id', msg.workspaceId).maybeSingle();
  const trust = (ws?.trust_level as string) ?? 'founder';

  if (trust === 'pro') {
    // Autonomous: enqueue as already-approved and send immediately.
    const { data: row } = await db
      .from('approval_queue')
      .insert({
        workspace_id: msg.workspaceId, kind: 'send_message',
        title: `מענה אוטומטי ל-${msg.from} (${msg.channel})`, body: reply,
        target_ref: msg.from, channel: msg.channel, status: 'approved', decided_at: now,
      })
      .select('id').single();
    if (row) await runExecutor();
  } else {
    // HITL: enqueue + notify the user with [approve]/[reject].
    await enqueueApproval({
      workspaceId: msg.workspaceId, kind: 'send_message',
      title: `הודעה חדשה מ-${msg.from} (${intent}) — הכנתי תשובה`,
      body: reply, targetRef: msg.from, channel: msg.channel,
    });
  }
}
