// Reviser / Editor (archetype 2b — the improver) — rewrites a drafted message to
// (a) address the Critic's concerns and (b) sound like a real human wrote it (the
// "humanize" pass the code documents but never implemented). Turns the Critic from
// a pure gate into a collaborator: draft → critique → revise, before send.
import { createLLM, CLAUDE_MODEL } from '@/lib/helix/llm';

export async function revise(
  draft: { subject?: string; body: string },
  feedback: string[],
  language: 'he' | 'en',
  channel: string,
): Promise<{ subject?: string; body: string } | null> {
  const fb = feedback.filter(Boolean).join('; ') || 'שפר טבעיות וחדד את הבקשה.';
  const langRule =
    language === 'he'
      ? 'כתוב בעברית אנושית וטבעית (לא מתורגמת, לא רובוטית). תקן שגיאות.'
      : 'Write in natural, human English.';

  const system = `אתה עורך פניות outbound. קיבלת טיוטה ומשוב מהמבקר. שכתב את הפנייה כך ש:
1. היא מטפלת בכל נקודות המשוב.
2. היא נשמעת כאילו אדם אמיתי כתב אותה — ${langRule}
3. שומרת על הערוץ (${channel}), על בקשה אחת ברורה, בלי הייפ ובלי מחמאות שאינן מבוססות.
אל תמציא עובדות חדשות על הליד. שמור על אורך דומה.
החזר JSON בלבד: {"subject": string|null, "body": string}.`;

  const user = `טיוטה נוכחית:\n${draft.subject ? `נושא: ${draft.subject}\n` : ''}${draft.body}\n\nמשוב לתיקון:\n${fb}`;

  try {
    const llm = createLLM();
    const res = await llm.chat.completions.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const p = JSON.parse(res.choices?.[0]?.message?.content ?? '{}') as { subject?: string | null; body?: string };
    if (!p.body) return null;
    return { subject: p.subject ?? draft.subject, body: p.body };
  } catch {
    return null;
  }
}
