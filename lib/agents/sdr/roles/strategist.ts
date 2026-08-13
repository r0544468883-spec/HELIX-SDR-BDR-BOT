// Strategist / Researcher (archetype 1) — before a word is written, decides the
// single strongest angle and which ONE personalization hook to use for THIS
// prospect. Today the Maker gets all hooks and "reference one" with no reasoning
// about which is most compelling; this fills that gap and hands the Writer a
// focused brief. It plans the angle; it does NOT write the message.
import { createLLM, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';

export type OutreachStrategy = {
  angle: string;        // the core reason-to-believe / why-now for this prospect
  chosenHook?: string;  // the single hook worth referencing (from the provided list)
  brief: string;        // 1-2 sentence directive for the Writer
};

export async function strategize(input: {
  facts: string;
  hooks?: string[];
  offer: string;
  channel: string;
  language: 'he' | 'en';
}): Promise<OutreachStrategy | null> {
  const hooks = input.hooks?.length ? input.hooks.join(' | ') : '(אין hooks)';
  const system = `אתה אסטרטג outbound. לפני שהכותב מנסח, תפקידך לבחור את הזווית החזקה ביותר לפנייה אל הליד הספציפי הזה, ואת ה-hook היחיד ששווה להזכיר.
כללים:
- angle = הסיבה-להאמין / ה-why-now שהכי רלוונטית ללקוח הזה לאור העובדות והמוצר. ממוקדת, לא גנרית.
- chosenHook = בחר hook אחד בלבד מהרשימה שסופקה (או השאר ריק אם אף אחד לא באמת רלוונטי — עדיף בלי מאשר hook מאולץ).
- brief = הנחיה של משפט-שניים לכותב: על מה להישען ומה להימנע.
- אל תמציא עובדות על הליד. הישען רק על מה שסופק.
החזר JSON בלבד: {"angle":"","chosenHook":"","brief":""}`;

  const user = `עובדות על הליד:\n${input.facts}\n\nההצעה שלנו:\n${input.offer}\n\nHooks זמינים:\n${hooks}\n\nערוץ: ${input.channel} · שפה: ${input.language}`;

  try {
    const llm = createLLM();
    const res = await llm.chat.completions.create({
      model: CLAUDE_MODEL_FAST,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const p = JSON.parse(res.choices?.[0]?.message?.content ?? '{}') as Partial<OutreachStrategy>;
    if (!p.angle && !p.brief) return null;
    return {
      angle: p.angle ?? '',
      chosenHook: p.chosenHook || undefined,
      brief: p.brief ?? p.angle ?? '',
    };
  } catch {
    return null;
  }
}
