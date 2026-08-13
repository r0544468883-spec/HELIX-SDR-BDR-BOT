// Verifier / Critic (archetype 3 — the adversary) — checks ONE enriched field
// against the snippets the extractor cited. Adversarial by default: it tries to
// find that the sources do NOT support the value (wrong company, inferred, inflated,
// fabricated). Runs on the fast tier — one cheap check per already-extracted field.
import { createLLM, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';
import type { FieldVerification, Supported } from '../contract';

type Snippet = { url: string; snippet: string };

export async function verifyField(
  field: string,
  value: unknown,
  snippets: Snippet[],
  confidence: number,
): Promise<FieldVerification | null> {
  const evidence =
    snippets.slice(0, 4).map((s, i) => `[מקור ${i + 1}] ${(s.snippet || '').slice(0, 400)}`).join('\n') ||
    '(אין קטע-מקור)';

  const system = `אתה מאמת-עובדות אדוורסרי קשוח לנתוני-העשרה של לידים. תפקידך לבדוק אם המקורות באמת תומכים בערך — לא להאמין לו. ברירת-מחדל: חשדנות.
כללים (מחייבים):
- supported="yes" אך ורק אם קטע-מקור אחד לפחות תומך ישירות ומפורשות בערך.
- supported="partial" אם יש רמז/תמיכה חלקית אך לא חד-משמעית.
- supported="no" אם אין תמיכה, המקור מדבר על חברה/ישות אחרת, או שהערך נראה מוסק/מנופח/מומצא.
- אל תמציא; הישען אך ורק על הקטעים שסופקו. ספק פועל לרעת הערך.
- adjustedConfidence: מספר 0..1, נמוך כשהתמיכה חלשה.
- note = משפט אחד קצר.
החזר JSON בלבד: {"supported":"yes|partial|no","adjustedConfidence":0.0,"note":""}`;

  const user = `שדה: ${field}\nערך שנטען: ${JSON.stringify(value)}\nביטחון מקורי: ${confidence}\n\nקטעי-מקור:\n${evidence}`;

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
    const txt = res.choices?.[0]?.message?.content ?? '';
    const p = JSON.parse(txt) as { supported?: string; adjustedConfidence?: number; note?: string };
    const supported: Supported = p.supported === 'yes' || p.supported === 'partial' ? p.supported : 'no';
    const adj = Number(p.adjustedConfidence);
    return {
      field,
      supported,
      adjustedConfidence: Number.isFinite(adj) ? Math.max(0, Math.min(1, adj)) : 0,
      note: typeof p.note === 'string' ? p.note : '',
    };
  } catch {
    return null;
  }
}
