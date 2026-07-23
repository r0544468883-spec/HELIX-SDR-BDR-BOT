// Canned / quick replies — instant answers to common INBOUND inquiries. Unlike
// approved templates (proactive, out-of-window), these fire INSIDE the 24h window
// as plain text, so no Meta approval is needed. Defaults below ship out of the box;
// a workspace can override/extend them via the canned_replies table.

export type CannedReply = {
  key: string;
  title: string;
  body: string;
  /** Lowercased keywords/phrases; an inbound message matching any → this reply. */
  triggers: string[];
};

export const DEFAULT_CANNED: CannedReply[] = [
  {
    key: 'price',
    title: 'מחיר',
    body: 'תודה על הפנייה! 💬 המחירים משתנים לפי השירות — נשמח לשלוח הצעה מדויקת. על איזה שירות מדובר?',
    triggers: ['מחיר', 'כמה עולה', 'עלות', 'תמחור', 'price', 'כמה זה'],
  },
  {
    key: 'hours',
    title: 'שעות פעילות',
    body: 'שעות הפעילות שלנו: א׳–ה׳ 09:00–19:00, ו׳ 09:00–13:00. מוזמנים לקפוץ! 🕘',
    triggers: ['שעות', 'פתוח', 'מתי אתם', 'שעת פעילות', 'hours', 'open'],
  },
  {
    key: 'address',
    title: 'כתובת',
    body: 'הכתובת שלנו: [כתובת העסק]. יש חנייה בסביבה. נשמח לראותכם 📍',
    triggers: ['כתובת', 'איפה אתם', 'מיקום', 'איך מגיעים', 'address', 'location', 'ניווט'],
  },
  {
    key: 'availability',
    title: 'זמינות / תור',
    body: 'נשמח לקבוע! 📅 מה התאריך והשעה שנוחים לך, ונבדוק זמינות מיד.',
    triggers: ['תור', 'פנוי', 'זמין', 'לקבוע', 'appointment', 'זמינות', 'מתי אפשר'],
  },
  {
    key: 'shipping',
    title: 'משלוח',
    body: 'המשלוח מגיע תוך 2–3 ימי עסקים 🚚 מעל [סכום]₪ המשלוח חינם. רוצה שנתחיל בהזמנה?',
    triggers: ['משלוח', 'שילוח', 'מתי מגיע', 'delivery', 'shipping', 'זמן אספקה'],
  },
  {
    key: 'contact',
    title: 'דבר עם נציג',
    body: 'מעבירים אותך לנציג/ה אנושי/ת 🙋 תיכף חוזרים אליך. אפשר גם להשאיר פרטים ונחזור בהקדם.',
    triggers: ['נציג', 'לדבר עם', 'אנושי', 'טלפון', 'שירות לקוחות', 'human', 'agent'],
  },
];

/** Match an inbound message to a canned reply (defaults + provided customs merged). */
export function matchCanned(text: string, extra: CannedReply[] = []): CannedReply | null {
  const t = (text || '').toLowerCase();
  const all = mergeCanned(extra);
  for (const c of all) {
    if (c.triggers.some((kw) => kw && t.includes(kw.toLowerCase()))) return c;
  }
  return null;
}

/** Custom rows (by key) override defaults; new keys are appended. */
export function mergeCanned(extra: CannedReply[]): CannedReply[] {
  const byKey = new Map<string, CannedReply>();
  for (const c of DEFAULT_CANNED) byKey.set(c.key, c);
  for (const c of extra) byKey.set(c.key, c);
  return [...byKey.values()];
}
