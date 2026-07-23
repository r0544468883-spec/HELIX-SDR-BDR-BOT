// COLD EMAIL catalog — subject + body templates for the outbound email sequence
// (aligns with the Cold Email playbook §3.5: Research→Segment→Write→Verify→Send).
// Email needs no Meta approval; these are internal copy templates with merge fields.
// Merge fields: {{name}} {{company}} {{trigger}} {{value}} {{proof}} {{cta}} {{sender}}

export type EmailTemplate = {
  key: string;
  title: string;
  step: number; // position in the sequence
  subject: string;
  body: string;
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: 'cold_opener',
    title: 'פתיח קר (מגע 1)',
    step: 1,
    subject: '{{company}} — {{trigger}}',
    body: [
      'היי {{name}},',
      '',
      'שמנו לב ל{{trigger}} ב{{company}} — {{value}}',
      '',
      'אם זה רלוונטי, אשמח ל-15 דקות להראות איך. {{cta}}',
      '',
      '{{sender}}',
    ].join('\n'),
  },
  {
    key: 'bump',
    title: 'תזכורת קצרה (מגע 2)',
    step: 2,
    subject: 'Re: {{company}} — {{trigger}}',
    body: ['היי {{name}}, רק צף למעלה 🙂 האם {{value}} מעניין אתכם? מספיק כן/לא.', '', '{{sender}}'].join('\n'),
  },
  {
    key: 'value',
    title: 'ערך / הוכחה (מגע 3)',
    step: 3,
    subject: 'איך {{company}} יכולה {{value}}',
    body: [
      'היי {{name}},',
      '',
      'חשבתי שיעניין אתכם: {{proof}}',
      '',
      'זה בדיוק סוג התוצאה שאנחנו מביאים ל{{company}}. שווה שיחה קצרה? {{cta}}',
      '',
      '{{sender}}',
    ].join('\n'),
  },
  {
    key: 'breakup',
    title: 'פרידה (מגע 4)',
    step: 4,
    subject: 'לסגור את הלולאה — {{company}}',
    body: [
      'היי {{name}},',
      '',
      'לא רוצה להטריד. אם התזמון לא מתאים — אין בעיה, אסגור מצידי.',
      'אם בכל זאת {{value}} רלוונטי, מספיק מילה ואחזור. {{cta}}',
      '',
      '{{sender}}',
    ].join('\n'),
  },
];

export type EmailCtx = {
  name?: string; company?: string; trigger?: string; value?: string;
  proof?: string; cta?: string; sender?: string;
};

export function getEmailTemplate(key: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}

// The approval_queue has no subject column, so we pack subject+body into `body`
// with a sentinel and unpack it at execution time (keeps the HITL flow intact).
const SUBJECT_SENTINEL = '##SUBJECT##';
export function packEmail(subject: string, body: string): string {
  return `${SUBJECT_SENTINEL}${subject}\n${body}`;
}
export function unpackEmail(content: string): { subject?: string; body: string } {
  if (content.startsWith(SUBJECT_SENTINEL)) {
    const nl = content.indexOf('\n');
    return { subject: content.slice(SUBJECT_SENTINEL.length, nl), body: content.slice(nl + 1) };
  }
  return { body: content };
}

/** Render a specific email template (built-in or custom) filling merge fields. */
export function renderEmailTemplate(t: Pick<EmailTemplate, 'subject' | 'body'>, ctx: EmailCtx): { subject: string; body: string } {
  const map: Record<string, string> = {
    '{{name}}': ctx.name || 'שלום',
    '{{company}}': ctx.company || '',
    '{{trigger}}': ctx.trigger || 'העשייה שלכם',
    '{{value}}': ctx.value || 'לחסוך זמן ולהגדיל תוצאות',
    '{{proof}}': ctx.proof || 'לקוח דומה ראה שיפור משמעותי תוך חודש.',
    '{{cta}}': ctx.cta || 'מתי נוח לכם השבוע?',
    '{{sender}}': ctx.sender || '',
  };
  const fill = (s: string) => Object.entries(map).reduce((acc, [k, v]) => acc.split(k).join(v), s).trim();
  return { subject: fill(t.subject), body: fill(t.body) };
}

/** Render a cold-email template by key (built-in catalog only). */
export function renderEmail(key: string, ctx: EmailCtx): { subject: string; body: string } | null {
  const t = getEmailTemplate(key);
  if (!t) return null;
  const map: Record<string, string> = {
    '{{name}}': ctx.name || 'שלום',
    '{{company}}': ctx.company || '',
    '{{trigger}}': ctx.trigger || 'העשייה שלכם',
    '{{value}}': ctx.value || 'לחסוך זמן ולהגדיל תוצאות',
    '{{proof}}': ctx.proof || 'לקוח דומה ראה שיפור משמעותי תוך חודש.',
    '{{cta}}': ctx.cta || 'מתי נוח לכם השבוע?',
    '{{sender}}': ctx.sender || '',
  };
  const fill = (s: string) => Object.entries(map).reduce((acc, [k, v]) => acc.split(k).join(v), s).trim();
  return { subject: fill(t.subject), body: fill(t.body) };
}
