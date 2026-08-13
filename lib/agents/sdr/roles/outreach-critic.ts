// Outreach Critic (archetype 3 — the adversary) — reviews a drafted outbound
// message BEFORE the autonomy switch may auto-send it in the user's name. The
// Maker (lib/agent/message::draftOutreach) writes it; this vets it. Guards the
// real cold-outreach risks: spam/compliance, a fabricated claim about the
// prospect ("congrats on the raise" that never happened), creepy personalization,
// unprofessional tone. Harsh, honest, direct. Doubt counts against sending.
import { createLLM, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';
import type { OutreachReview, OutreachVerdict } from '../contract';

export async function critiqueOutreach(message: string, channel: string): Promise<OutreachReview | null> {
  const system = `אתה מבקר קשוח וישיר לפניות outbound שהבוט עומד לשלוח אוטומטית בשם המשתמש לליד. תפקידך למצוא סיכון — לא לשבח. ברירת-מחדל: חשדנות.
כללים (מחייבים):
1. ציות/ספאם: פנייה קרה בערוץ ${channel} שנשמעת ספאם, אגרסיבית, עם הבטחות-יתר, או חסרת מוצא/הקשר הגיוני → safeToSend=false.
2. דיוק: אם הפנייה טוענת עובדה ספציפית על הליד/החברה שנשמעת מומצאת או לא-מבוססת (למשל "מזל טוב על הגיוס") → verdict=block. עדיף לא לשלוח מחמאה שגויה מאשר לשלוח.
3. פרסונליזציה: hook אישי-מדי/פולשני ("ראיתי שאתה...") שמרגיש מפחיד → revise.
4. טון: לא-מקצועי, מביך, או לא בקול עסקי → revise/block.
5. אל תמציא בעיות; כל חשש חייב להתבסס על הטקסט. היה כן בשני הכיוונים.
6. safeToSend=true אך ורק אם הפנייה מקצועית, מדויקת, לא-ספאמית ובטוחה לשליחה אוטומטית בשם המשתמש. בכל ספק — false (תמתין לאישור-אדם).
7. note = משפט אחד בוטה על הפנייה.
verdict: "block" (מסוכן/שגוי), "revise" (בסיס טוב אך צריך תיקון או עין-אדם), "send" (בטוח לשליחה אוטומטית).
החזר JSON בלבד: {"verdict":"send|revise|block","safeToSend":false,"risks":[],"note":""}`;

  const user = `ערוץ: ${channel}\n\nהפנייה שתישלח:\n"""${(message || '').slice(0, 1500)}"""`;

  try {
    const llm = createLLM();
    const res = await llm.chat.completions.create({
      model: CLAUDE_MODEL_FAST,
      max_tokens: 350,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const p = JSON.parse(res.choices?.[0]?.message?.content ?? '{}') as {
      verdict?: string;
      safeToSend?: boolean;
      risks?: string[];
      note?: string;
    };
    const verdict: OutreachVerdict = p.verdict === 'send' || p.verdict === 'revise' ? p.verdict : 'block';
    return {
      verdict,
      safeToSend: p.safeToSend === true && verdict === 'send',
      risks: Array.isArray(p.risks) ? p.risks : [],
      note: typeof p.note === 'string' ? p.note : '',
    };
  } catch {
    return null;
  }
}
