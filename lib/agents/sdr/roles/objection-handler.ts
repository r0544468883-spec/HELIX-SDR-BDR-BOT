// Objection-handler (collected from the 11x/Reply.io playbook — reply classification
// + objection handling). Given the prospect's reply, classifies the objection and
// picks a short response strategy that the follow-up writer should take. It doesn't
// write the message — it hands the writer a focused angle.
import { createLLM, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';

export type ObjectionType = 'price' | 'timing' | 'competitor' | 'not_interested' | 'need_info' | 'positive' | 'other';

export interface ObjectionRead {
  type: ObjectionType;
  strategy: string; // one-line angle for the follow-up (e.g. "acknowledge budget, offer a smaller pilot")
}

export async function handleObjection(reply: string): Promise<ObjectionRead | null> {
  if (!reply.trim()) return null;
  const system = `אתה מומחה לטיפול בהתנגדויות במכירות. סווג את תגובת הליד ובחר אסטרטגיית-מענה קצרה לפולואפ.
- type: price | timing | competitor | not_interested | need_info | positive | other.
- strategy: משפט אחד — איזו זווית לנקוט בפולואפ (למשל: "הכר בתקציב, הצע פיילוט קטן"). לא לדחוף כשזה not_interested — הצע לסגור בכבוד.
החזר JSON בלבד: {"type":"","strategy":""}`;
  try {
    const res = await createLLM().chat.completions.create({
      model: CLAUDE_MODEL_FAST,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `תגובת הליד:\n"""${reply.slice(0, 800)}"""` },
      ],
    });
    const p = JSON.parse(res.choices?.[0]?.message?.content ?? '{}') as { type?: string; strategy?: string };
    const types: ObjectionType[] = ['price', 'timing', 'competitor', 'not_interested', 'need_info', 'positive', 'other'];
    return {
      type: types.includes(p.type as ObjectionType) ? (p.type as ObjectionType) : 'other',
      strategy: typeof p.strategy === 'string' ? p.strategy : '',
    };
  } catch {
    return null;
  }
}
