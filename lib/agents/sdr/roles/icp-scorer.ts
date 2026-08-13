// ICP Scorer / Qualifier (a Researcher-Critic that gates the whole flow) — before
// we spend a draft + a send on a lead, decide whether the lead is even worth
// reaching out to, given the workspace's Ideal Customer Profile. Stops the bot from
// personalizing and messaging leads that will never convert.
import { createLLM, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';

export type IcpScore = {
  fit: number;            // 0..100 how well the lead matches the ICP
  worthContacting: boolean;
  reason: string;
};

export async function scoreIcp(input: { facts: string; icp: string; offer: string }): Promise<IcpScore | null> {
  if (!input.icp?.trim()) return null; // no ICP defined → no gate (caller proceeds)

  const system = `אתה מסנן לידים (SDR qualifier) קשוח. בהינתן פרופיל-לקוח-אידיאלי (ICP) ועובדות על ליד, החלט עד כמה הליד מתאים, ואם בכלל שווה לפנות אליו.
כללים:
- fit = 0..100 התאמה ל-ICP לפי העובדות בלבד. אל תמציא.
- worthContacting=false אם ההתאמה חלשה, הליד מחוץ ל-ICP, או שאין מספיק מידע כדי להצדיק פנייה. עדיף לוותר על ליד גרוע מאשר לשרוף פנייה.
- reason = משפט קצר.
החזר JSON בלבד: {"fit":0,"worthContacting":false,"reason":""}`;

  const user = `ICP (פרופיל לקוח אידיאלי):\n${input.icp}\n\nההצעה שלנו:\n${input.offer}\n\nעובדות על הליד:\n${input.facts}`;

  try {
    const llm = createLLM();
    const res = await llm.chat.completions.create({
      model: CLAUDE_MODEL_FAST,
      max_tokens: 250,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const p = JSON.parse(res.choices?.[0]?.message?.content ?? '{}') as Partial<IcpScore>;
    const fit = Number(p.fit);
    return {
      fit: Number.isFinite(fit) ? Math.max(0, Math.min(100, fit)) : 0,
      worthContacting: p.worthContacting === true,
      reason: typeof p.reason === 'string' ? p.reason : '',
    };
  } catch {
    return null;
  }
}
