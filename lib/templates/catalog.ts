// WhatsApp TEMPLATE CATALOG — one approved template per proactive feature of the
// SDR bot. Templates are the compliant way to open a conversation outside the 24h
// window (Meta §business-initiated). Each entry is BOTH:
//   1. a Meta registration payload (used by /api/templates/sync to create them), and
//   2. a runtime mapping (name + language + how to build the ordered {{n}} params)
//      used by the lifecycle runner to send via sendWhatsAppTemplate().
// Body copy mirrors lib/lifecycle/templates.ts so in-window (free-text) and
// out-of-window (template) sends read identically.

export type TemplateCategory = 'UTILITY' | 'MARKETING';

export type TemplateDef = {
  /** WhatsApp template name (a–z0–9_ only, unique per WABA). */
  name: string;
  language: string; // 'he'
  category: TemplateCategory;
  /** Body with {{1}},{{2}}… placeholders, exactly as registered with Meta. */
  body: string;
  /** Human-readable list of what each {{n}} is, for the example block + docs. */
  params: string[];
  /** Optional dynamic URL button (e.g. confirm/cancel page). {{1}} = suffix. */
  urlButton?: { text: string; baseUrl: string }; // full url = baseUrl + {{1}}
  sampleParams: string[];
  sampleUrlSuffix?: string;
};

// Feature → template. `key` matches the lifecycle Kind where relevant, plus the
// outreach features that also go out proactively.
export const TEMPLATES: Record<string, TemplateDef> = {
  appt_reminder: {
    name: 'sdr_appt_reminder',
    language: 'he',
    category: 'UTILITY',
    body: 'שלום {{1}} 👋 תזכורת: יש לך תור{{2}} ל־{{3}} בשעה {{4}}. לאישור או ביטול הקישו על הכפתור.',
    params: ['שם הלקוח', 'עבור מי (למשל " לרקסי") או ריק', 'תאריך', 'שעה'],
    urlButton: { text: 'אישור / ביטול', baseUrl: '{{APP_URL}}/r/' },
    sampleParams: ['דנה', ' לרקסי', '12/08', '10:30'],
    sampleUrlSuffix: 'abc123',
  },
  appt_sameday: {
    name: 'sdr_appt_sameday',
    language: 'he',
    category: 'UTILITY',
    body: 'בוקר טוב {{1}}! תזכורת אחרונה — התור{{2}} היום בשעה {{3}}. לאישור או ביטול הקישו על הכפתור.',
    params: ['שם הלקוח', 'עבור מי או ריק', 'שעה'],
    urlButton: { text: 'אישור / ביטול', baseUrl: '{{APP_URL}}/r/' },
    sampleParams: ['דנה', ' לרקסי', '10:30'],
    sampleUrlSuffix: 'abc123',
  },
  renewal: {
    name: 'sdr_renewal',
    language: 'he',
    category: 'MARKETING',
    body: 'שלום {{1}}, המנוי שלך מתקרב לחידוש. רוצה שנחדש אוטומטית ונחסוך לך את הטרחה? {{2}}',
    params: ['שם הלקוח', 'שורת קופון או ריק'],
    sampleParams: ['דנה', 'השתמשי בקוד RENEW10 להטבה 🎁'],
  },
  replenish: {
    name: 'sdr_replenish',
    language: 'he',
    category: 'MARKETING',
    body: 'היי {{1}} 🐾 עבר זמן מאז שרכשת {{2}}. אולי הגיע הזמן להזמנה חוזרת? {{3}}',
    params: ['שם הלקוח', 'שם המוצר', 'שורת קופון או ריק'],
    sampleParams: ['דנה', 'מזון לכלבים 12ק״ג', 'קוד BACK15 מחכה לך 🎁'],
  },
  birthday: {
    name: 'sdr_birthday',
    language: 'he',
    category: 'MARKETING',
    body: 'מזל טוב {{1}}! 🎉 חוגגים יום הולדת — הכנו לך הטבה מיוחדת. {{2}}',
    params: ['שם החוגג/ת (לקוח או חיה)', 'שורת קופון או ריק'],
    sampleParams: ['רקסי', 'קוד BDAY20 בתוקף השבוע 🎁'],
  },
  // Outreach features that also open proactively (cold / stage-aware / win-back).
  cold_opener: {
    name: 'sdr_cold_opener',
    language: 'he',
    category: 'MARKETING',
    body: 'שלום {{1}}, כאן {{2}} מ־{{3}}. שמנו לב ל{{4}} וחשבנו שיהיה רלוונטי לדבר. מתאים לכם שנקבע שיחה קצרה?',
    params: ['שם הנמען', 'שם הנציג', 'שם החברה שלנו', 'טריגר/סיבת-פנייה'],
    sampleParams: ['יוסי', 'רון', 'HELIX', 'גיוס ההון האחרון שלכם'],
  },
  followup: {
    name: 'sdr_followup',
    language: 'he',
    category: 'MARKETING',
    body: 'היי {{1}}, רק רציתי לחזור בנוגע ל{{2}}. {{3}} אשמח לדעת אם זה עדיין רלוונטי עבורכם.',
    params: ['שם הנמען', 'הנושא', 'משפט-ערך/proof קצר'],
    sampleParams: ['יוסי', 'ההצעה ששלחנו', 'לקוח דומה חסך 30% תוך חודש.'],
  },
  reengage: {
    name: 'sdr_reengage',
    language: 'he',
    category: 'MARKETING',
    body: 'שלום {{1}} 👋 מזמן לא דיברנו. יש לנו {{2}} שחשבנו שיעניין אתכם. שווה לכם דקה?',
    params: ['שם הנמען', 'עדכון/חידוש/הטבה'],
    sampleParams: ['יוסי', 'תכונה חדשה + הטבת חוזרים'],
  },
};

/** Runtime: build the ordered {{n}} params a template expects from render context. */
export function templateParams(key: string, ctx: {
  name?: string; entityFor?: string; date?: string; time?: string; product?: string;
  couponLine?: string; entity?: string; rep?: string; company?: string; trigger?: string;
  topic?: string; proof?: string; update?: string;
}): { def: TemplateDef; params: string[]; urlSuffix?: string } | null {
  const def = TEMPLATES[key];
  if (!def) return null;
  const map: Record<string, string[]> = {
    appt_reminder: [ctx.name ?? '', ctx.entityFor ?? '', ctx.date ?? '', ctx.time ?? ''],
    appt_sameday: [ctx.name ?? '', ctx.entityFor ?? '', ctx.time ?? ''],
    renewal: [ctx.name ?? '', ctx.couponLine ?? ''],
    replenish: [ctx.name ?? '', ctx.product ?? '', ctx.couponLine ?? ''],
    birthday: [ctx.entity ?? ctx.name ?? '', ctx.couponLine ?? ''],
    cold_opener: [ctx.name ?? '', ctx.rep ?? '', ctx.company ?? '', ctx.trigger ?? ''],
    followup: [ctx.name ?? '', ctx.topic ?? '', ctx.proof ?? ''],
    reengage: [ctx.name ?? '', ctx.update ?? ''],
  };
  return { def, params: map[key] ?? [] };
}

/** Build the Meta message_templates registration payload for one template. */
export function registrationPayload(def: TemplateDef, appUrl: string): Record<string, unknown> {
  const components: Record<string, unknown>[] = [
    { type: 'BODY', text: def.body, example: { body_text: [def.sampleParams] } },
  ];
  if (def.urlButton) {
    const base = def.urlButton.baseUrl.replace('{{APP_URL}}', appUrl.replace(/\/$/, ''));
    components.push({
      type: 'BUTTONS',
      buttons: [{ type: 'URL', text: def.urlButton.text, url: `${base}{{1}}`, example: [`${base}${def.sampleUrlSuffix ?? 'sample'}`] }],
    });
  }
  return { name: def.name, language: def.language, category: def.category, components };
}

export function allRegistrationPayloads(appUrl: string): Record<string, unknown>[] {
  return Object.values(TEMPLATES).map((d) => registrationPayload(d, appUrl));
}
