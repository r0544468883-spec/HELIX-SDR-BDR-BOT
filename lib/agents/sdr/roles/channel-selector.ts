// Channel Selector (a Researcher that routes) — picks the best FIRST-touch channel
// for a lead from what's available, respecting compliance: cold WhatsApp/SMS in
// Israel is a fine/ban risk, so it is never chosen for a cold first touch. Prefers
// email or LinkedIn where the lead's context makes one more natural.
import { createLLM, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';

export type Channel = 'email' | 'whatsapp' | 'telegram' | 'linkedin';
export type ChannelChoice = { channel: Channel; reason: string };

// Compliance backstop: cold outbound on these channels is blocked regardless of
// what the model suggests. Mirrors the product's §30A cold-WhatsApp block.
const COLD_BLOCKED: Channel[] = ['whatsapp', 'telegram'];

export async function selectChannel(input: {
  facts: string;
  available: Channel[];
  language: 'he' | 'en';
}): Promise<ChannelChoice | null> {
  const allowed = input.available.filter((c) => !COLD_BLOCKED.includes(c));
  const pool = allowed.length ? allowed : (['email'] as Channel[]);
  if (pool.length === 1) return { channel: pool[0], reason: 'הערוץ היחיד המותר לפנייה קרה' };

  const system = `אתה מנתב ערוצי פנייה קרה. בחר את הערוץ הראשון הטוב ביותר לליד מתוך הרשימה המותרת בלבד.
כללים:
- בחר אך ורק מהערוצים המותרים שסופקו (פנייה קרה בוואטסאפ/סמס בישראל חסומה מראש ואינה ברשימה).
- העדף לינקדאין כשההקשר מקצועי/B2B ויש טביעה מקצועית; אחרת מייל.
- reason = משפט קצר.
החזר JSON בלבד: {"channel":"email|linkedin","reason":""}`;

  const user = `ערוצים מותרים: ${pool.join(', ')}\nשפה: ${input.language}\n\nעובדות על הליד:\n${input.facts}`;

  try {
    const llm = createLLM();
    const res = await llm.chat.completions.create({
      model: CLAUDE_MODEL_FAST,
      max_tokens: 150,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const p = JSON.parse(res.choices?.[0]?.message?.content ?? '{}') as { channel?: string; reason?: string };
    const picked = pool.includes(p.channel as Channel) ? (p.channel as Channel) : pool[0];
    return { channel: picked, reason: typeof p.reason === 'string' ? p.reason : '' };
  } catch {
    return { channel: pool[0], reason: 'ברירת מחדל (המנתב לא זמין)' };
  }
}
