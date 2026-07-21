// Inbound message intelligence — classify intent + draft a grounded reply.
// classify uses the FAST tier (high volume, low stakes); reply uses the QUALITY tier.
// Reply is grounded in recent conversation context (conversation_memory RAG lands later, §3.3.6).
import { createLLM, CLAUDE_MODEL, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';

export type Intent = 'interested' | 'objection' | 'question' | 'not-now' | 'spam' | 'other';

const INTENTS: Intent[] = ['interested', 'objection', 'question', 'not-now', 'spam', 'other'];

/** Classify a single inbound message. Cheap + fast. */
export async function classifyIntent(text: string): Promise<Intent> {
  const llm = createLLM();
  try {
    const res = await llm.chat.completions.create({
      model: CLAUDE_MODEL_FAST,
      messages: [
        { role: 'system', content: `Classify the sales-conversation intent of the message. Respond as JSON: {"intent": one of ${INTENTS.join('|')}}.` },
        { role: 'user', content: text.slice(0, 2000) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 30,
    });
    const raw = res.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { intent?: string };
    return (INTENTS.includes(parsed.intent as Intent) ? parsed.intent : 'other') as Intent;
  } catch {
    return 'other';
  }
}

/** Draft a reply to an inbound message, in the sender's language, grounded in recent history. */
export async function draftReply(
  inbound: string,
  history: { direction: 'in' | 'out'; body: string }[] = [],
  intent: Intent = 'other',
): Promise<string> {
  const llm = createLLM();
  const convo = history
    .slice(-8)
    .map((m) => `${m.direction === 'in' ? 'Them' : 'Us'}: ${m.body}`)
    .join('\n');

  const sys = `You are a helpful, human-sounding sales rep. Reply in the SAME language as the incoming message (Hebrew stays natural Hebrew).
Detected intent: ${intent}. Handle objections calmly, answer questions concretely, never pushy. 2-4 short sentences. Sound like a real person, not a bot.`;
  const user = `${convo ? `Conversation so far:\n${convo}\n\n` : ''}New incoming message:\n${inbound}\n\nWrite the reply.`;

  const res = await llm.chat.completions.create({
    model: CLAUDE_MODEL,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    max_tokens: 400,
  });
  return res.choices[0]?.message?.content?.trim() || '';
}
