// Operator bot commands — the business OWNER talks to the bot to run the system
// from WhatsApp/Telegram/email. Distinct from the lead auto-reply flow: messages
// from a linked operator identity (bot_links) route HERE. Every lifecycle function
// is reachable from natural Hebrew; an LLM parses intent → we dispatch to the
// same schedule/import/stats code the API routes use.
import { supabaseAdmin } from '@/lib/helix/supabase';
import { createLLM, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';
import { scheduleAppointment, scheduleRenewal, scheduleReplenishment, scheduleBirthday } from '@/lib/lifecycle/schedule';
import { sendOtp } from '@/lib/lifecycle/otp';

export type BotChannel = 'whatsapp' | 'telegram' | 'email';

const HELP = [
  'שלום 👋 אני עוזר ה-SDR. אפשר לבקש ממני בשפה חופשית, למשל:',
  '• "קבע תור לדנה 0501234567 מחר ב-10:30 עבור רקסי"',
  '• "תזכיר לדני 0521112222 לחדש מנוי בעוד שבועיים, קוד RENEW10"',
  '• "רכישה חוזרת ליוסי 0533334444 — מזון לכלבים, כל 30 יום"',
  '• "יום הולדת לרקסי (של דנה 0501234567) בתאריך 2026-08-12"',
  '• "ייבא לקוחות" ואז הדבק שורות CSV: שם,טלפון,אימייל,תאריך_לידה,שם_חיה',
  '• "שלח קוד אימות ל-0501234567" — OTP בוואטסאפ',
  '• "סטטוס" / "מה יש היום" — סיכום תזכורות ותורים',
].join('\n');

// Resolve the operator's workspace (null → not a linked operator).
export async function resolveOperatorWorkspace(channel: BotChannel, identifier: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db.from('bot_links').select('workspace_id').eq('channel', channel).eq('identifier', identifier).maybeSingle();
  return (data?.workspace_id as string) ?? null;
}

async function findOrCreateCustomer(workspaceId: string, name?: string, phone?: string): Promise<string | null> {
  const db = supabaseAdmin();
  if (phone) {
    const { data: hit } = await db.from('lifecycle_customers').select('id').eq('workspace_id', workspaceId).eq('phone', phone).maybeSingle();
    if (hit) return hit.id as string;
  }
  const { data: ins } = await db.from('lifecycle_customers')
    .insert({ workspace_id: workspaceId, name: name ?? null, phone: phone ?? null, source: 'bot' }).select('id').single();
  return (ins?.id as string) ?? null;
}

type ParsedIntent = {
  intent: 'appointment' | 'renewal' | 'replenish' | 'birthday' | 'import' | 'stats' | 'due' | 'help';
  customer_name?: string; phone?: string; entity?: string;
  datetime?: string; date?: string; days?: number; product?: string; coupon?: string; title?: string;
};

async function parseIntent(text: string): Promise<ParsedIntent> {
  const now = new Date();
  const sys = `אתה מנתח פקודות לעוזר SDR בעברית. החזר JSON בלבד עם השדות:
intent (אחד מ: appointment, renewal, replenish, birthday, import, stats, due, help),
customer_name, phone (E.164 עם +972 אם ישראלי, המר 05X ל-+9725X), entity (שם ישות משנית כמו חיה),
datetime (ISO 8601 מלא לתור), date (YYYY-MM-DD ליום הולדת), days (מספר ימים לרכישה חוזרת),
product, coupon, title.
התאריך והשעה עכשיו: ${now.toISOString()}. פענח ביטויים יחסיים ("מחר", "בעוד שבועיים") ביחס לזמן הזה.
אם לא ברור — intent="help".`;
  try {
    const llm = createLLM();
    const res = await llm.chat.completions.create({
      model: CLAUDE_MODEL_FAST,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: text }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    return JSON.parse(res.choices[0]?.message?.content ?? '{}') as ParsedIntent;
  } catch {
    return { intent: 'help' };
  }
}

async function stats(workspaceId: string): Promise<string> {
  const db = supabaseAdmin();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  const [customers, dueToday, sentToday, appts] = await Promise.all([
    db.from('lifecycle_customers').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    db.from('lifecycle_jobs').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'scheduled').lte('send_at', endOfDay.toISOString()),
    db.from('lifecycle_jobs').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'sent').gte('created_at', startOfDay.toISOString()),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('scheduled_at', startOfDay.toISOString()).lte('scheduled_at', endOfDay.toISOString()),
  ]);
  return [
    '📊 סטטוס SDR:',
    `• לקוחות במערכת: ${customers.count ?? 0}`,
    `• תזכורות שממתינות לשליחה (עד סוף היום): ${dueToday.count ?? 0}`,
    `• תזכורות שנשלחו היום: ${sentToday.count ?? 0}`,
    `• תורים היום: ${appts.count ?? 0}`,
  ].join('\n');
}

async function due(workspaceId: string): Promise<string> {
  const db = supabaseAdmin();
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const { data } = await db.from('lifecycle_jobs')
    .select('kind, send_at, customer_id').eq('workspace_id', workspaceId).eq('status', 'scheduled')
    .lte('send_at', end.toISOString()).order('send_at', { ascending: true }).limit(15);
  if (!data?.length) return 'אין תזכורות שממתינות היום ✅';
  const labels: Record<string, string> = { appt_reminder: 'תזכורת תור', appt_sameday: 'תזכורת יום-התור', renewal: 'חידוש מנוי', replenish: 'רכישה חוזרת', birthday: 'יום הולדת' };
  const lines = data.map((j) => `• ${labels[j.kind] ?? j.kind} — ${new Date(j.send_at as string).toLocaleString('he-IL')}`);
  return ['🗓️ תזכורות היום:', ...lines].join('\n');
}

export async function handleOperatorCommand(input: { workspaceId: string; text: string }): Promise<string> {
  const { workspaceId, text } = input;
  const t = text.trim();
  if (!t || /^(עזרה|help|\?)/i.test(t)) return HELP;
  if (/^(סטטוס|status|דוח|מה יש|סיכום)/i.test(t)) return stats(workspaceId);
  if (/(תזכורות|due).*(היום|today)|^תזכורות/i.test(t)) return due(workspaceId);
  if (/^(ייבא|import|העלה לקוחות)/i.test(t)) {
    return 'שלח/י את הלקוחות כשורות CSV (כותרת ראשונה):\nname,phone,email,birthday,pet_name,pet_birthday\nאו קרא/י ל-POST /api/lifecycle/import. אחרי הייבוא ימי-ההולדת יתוזמנו אוטומטית.';
  }
  // "שלח קוד אימות ל-05..." → OTP over WhatsApp.
  if (/(קוד אימות|otp|שלח קוד)/i.test(t)) {
    const phone = (t.match(/(\+?972\d{8,9}|0\d{8,9})/) || [])[0];
    if (!phone) return 'למי לשלוח קוד אימות? כלול/י מספר טלפון.';
    const e164 = phone.startsWith('0') ? '+972' + phone.slice(1) : phone.startsWith('+') ? phone : '+' + phone;
    const r = await sendOtp(workspaceId, e164);
    return r.ok ? `✅ נשלח קוד אימות ל-${e164}.` : `שגיאה בשליחת הקוד: ${r.error}`;
  }

  const p = await parseIntent(t);
  try {
    switch (p.intent) {
      case 'stats': return stats(workspaceId);
      case 'due': return due(workspaceId);
      case 'appointment': {
        if (!p.datetime) return 'מתי התור? נסה/י שוב עם תאריך ושעה, למשל "מחר ב-10:30".';
        const customerId = await findOrCreateCustomer(workspaceId, p.customer_name, p.phone);
        if (!customerId) return 'לא הצלחתי לזהות/ליצור את הלקוח.';
        if (p.entity) await supabaseAdmin().from('lifecycle_customers').update({ fields: { pet_name: p.entity } }).eq('id', customerId);
        const r = await scheduleAppointment({ workspaceId, customerId, title: p.title, scheduledAt: p.datetime });
        return r.ok ? `✅ נקבע תור ל-${p.customer_name ?? 'לקוח'} ל-${new Date(p.datetime).toLocaleString('he-IL')}. יישלחו תזכורות אוטומטית.` : `שגיאה: ${r.error}`;
      }
      case 'renewal': {
        const customerId = await findOrCreateCustomer(workspaceId, p.customer_name, p.phone);
        if (!customerId) return 'לא זיהיתי את הלקוח.';
        const sendAt = p.datetime || new Date(Date.now() + (p.days ?? 14) * 86400000).toISOString();
        await scheduleRenewal({ workspaceId, customerId, sendAt, coupon: p.coupon });
        return `✅ תוזכר תזכורת חידוש ל-${p.customer_name ?? 'לקוח'} ל-${new Date(sendAt).toLocaleDateString('he-IL')}.`;
      }
      case 'replenish': {
        if (!p.product) return 'איזה מוצר? למשל "מזון לכלבים כל 30 יום".';
        const customerId = await findOrCreateCustomer(workspaceId, p.customer_name, p.phone);
        if (!customerId) return 'לא זיהיתי את הלקוח.';
        await scheduleReplenishment({ workspaceId, customerId, product: p.product, replenishDays: p.days ?? 30, coupon: p.coupon });
        return `✅ תוזמנה תזכורת רכישה חוזרת ל-${p.product} בעוד ${p.days ?? 30} יום.`;
      }
      case 'birthday': {
        if (!p.date) return 'מה תאריך יום ההולדת? (YYYY-MM-DD)';
        const customerId = await findOrCreateCustomer(workspaceId, p.customer_name, p.phone);
        if (!customerId) return 'לא זיהיתי את הלקוח.';
        await scheduleBirthday({ workspaceId, customerId, dateStr: p.date, who: p.entity ? 'entity' : 'customer', coupon: p.coupon });
        return `🎉 תוזמנה הטבת יום-הולדת ל-${p.entity ?? p.customer_name ?? 'לקוח'} בתאריך ${p.date}.`;
      }
      case 'import':
        return 'שלח/י שורות CSV: name,phone,email,birthday,pet_name,pet_birthday';
      default:
        return HELP;
    }
  } catch (e) {
    return `שגיאה בביצוע: ${e instanceof Error ? e.message : 'לא ידועה'}`;
  }
}
