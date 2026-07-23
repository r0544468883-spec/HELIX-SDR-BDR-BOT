// WhatsApp TEMPLATE CATALOG — one approved template per proactive feature of the
// SDR bot. Templates are the compliant way to open a conversation outside the 24h
// window (Meta §business-initiated). Each entry is BOTH:
//   1. a Meta registration payload (used by /api/templates/sync to create them), and
//   2. a runtime mapping (name + language + how to build the ordered {{n}} params)
//      used by the lifecycle runner to send via sendWhatsAppTemplate().
// Body copy mirrors lib/lifecycle/templates.ts so in-window (free-text) and
// out-of-window (template) sends read identically.

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

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
  /**
   * Optional QUICK_REPLY buttons. The labels are registered with Meta; the tap
   * PAYLOAD is set per-send (see sendWhatsAppTemplate) so the button reply that
   * lands on the webhook is self-describing (e.g. "confirm:<token>"). No public
   * page needed — the reply arrives as an inbound `button` message.
   */
  quickReply?: string[];
  /**
   * AUTHENTICATION (OTP) template. Meta fixes the body copy for this category and
   * appends a security line + a COPY-CODE button; we only declare expiry + button.
   */
  auth?: { codeExpiryMinutes: number; buttonText: string };
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

  // ── קטגוריה: אימות (OTP) ──────────────────────────────────────────────
  // AUTHENTICATION: Meta fixes the copy ("{{1}} הוא קוד האימות שלך") and appends a
  // COPY-CODE button + security line. We supply only the code as {{1}} + expiry.
  otp: {
    name: 'sdr_otp',
    language: 'he',
    category: 'AUTHENTICATION',
    body: '{{1}} הוא קוד האימות שלך. הקוד תקף ל-{{2}} דקות ואין לשתף אותו.',
    params: ['קוד האימות', 'דקות תוקף'],
    auth: { codeExpiryMinutes: 5, buttonText: 'העתקת הקוד' },
    sampleParams: ['123456', '5'],
  },

  // ── קטגוריה: עדכון סטטוס הזמנה ────────────────────────────────────────
  order_confirmed: {
    name: 'sdr_order_confirmed',
    language: 'he',
    category: 'UTILITY',
    body: 'שלום {{1}} 🎉 הזמנה מס׳ {{2}} התקבלה בהצלחה! נעדכן אותך בכל שלב. סה״כ: {{3}}.',
    params: ['שם הלקוח', 'מספר הזמנה', 'סכום'],
    sampleParams: ['דנה', '#10432', '₪249'],
  },
  order_shipped: {
    name: 'sdr_order_shipped',
    language: 'he',
    category: 'UTILITY',
    body: '📦 {{1}}, הזמנה {{2}} יצאה לדרך! זמן אספקה משוער: {{3}}. מספר מעקב: {{4}}.',
    params: ['שם הלקוח', 'מספר הזמנה', 'זמן אספקה משוער', 'מספר מעקב'],
    sampleParams: ['דנה', '#10432', '2-3 ימי עסקים', 'IL938271'],
  },
  order_ready: {
    name: 'sdr_order_ready',
    language: 'he',
    category: 'UTILITY',
    body: 'שלום {{1}}, הזמנה {{2}} מוכנה לאיסוף ב{{3}} 🛍️ שעות הפעילות: {{4}}.',
    params: ['שם הלקוח', 'מספר הזמנה', 'סניף/כתובת', 'שעות פעילות'],
    sampleParams: ['דנה', '#10432', 'סניף ת״א, דיזנגוף 100', "א'-ה' 9:00-19:00"],
  },

  // ── קטגוריה: Quick-Reply (כפתורי-תשובה, בלי דף URL) ───────────────────
  // The tap sends a PAYLOAD back to the webhook (set per-send). Cleaner than a URL
  // page: confirm/cancel/reorder happen inside WhatsApp with one tap.
  appt_confirm_qr: {
    name: 'sdr_appt_confirm_qr',
    language: 'he',
    category: 'UTILITY',
    body: 'שלום {{1}} 👋 תזכורת: יש לך תור{{2}} ל־{{3}} בשעה {{4}}. אנא אשר/י או בטל/י:',
    params: ['שם הלקוח', 'עבור מי או ריק', 'תאריך', 'שעה'],
    quickReply: ['אישור התור', 'ביטול'],
    sampleParams: ['דנה', ' לרקסי', '12/08', '10:30'],
  },
  reorder_qr: {
    name: 'sdr_reorder_qr',
    language: 'he',
    category: 'MARKETING',
    body: 'היי {{1}} 🐾 עבר זמן מאז שרכשת {{2}}. לחדש את ההזמנה בקליק?',
    params: ['שם הלקוח', 'שם המוצר'],
    quickReply: ['כן, להזמין שוב', 'לא תודה'],
    sampleParams: ['דנה', 'מזון לכלבים 12ק״ג'],
  },
};

/** Runtime: build the ordered {{n}} params a template expects from render context. */
export function templateParams(key: string, ctx: {
  name?: string; entityFor?: string; date?: string; time?: string; product?: string;
  couponLine?: string; entity?: string; rep?: string; company?: string; trigger?: string;
  topic?: string; proof?: string; update?: string;
  code?: string; expiryMinutes?: string; orderRef?: string; amount?: string;
  eta?: string; branch?: string; hours?: string; tracking?: string;
}): { def: TemplateDef; params: string[]; urlSuffix?: string } | null {
  const def = TEMPLATES[key];
  if (!def) return null;
  const map: Record<string, string[]> = {
    appt_reminder: [ctx.name ?? '', ctx.entityFor ?? '', ctx.date ?? '', ctx.time ?? ''],
    appt_sameday: [ctx.name ?? '', ctx.entityFor ?? '', ctx.time ?? ''],
    appt_confirm_qr: [ctx.name ?? '', ctx.entityFor ?? '', ctx.date ?? '', ctx.time ?? ''],
    renewal: [ctx.name ?? '', ctx.couponLine ?? ''],
    replenish: [ctx.name ?? '', ctx.product ?? '', ctx.couponLine ?? ''],
    reorder_qr: [ctx.name ?? '', ctx.product ?? ''],
    birthday: [ctx.entity ?? ctx.name ?? '', ctx.couponLine ?? ''],
    cold_opener: [ctx.name ?? '', ctx.rep ?? '', ctx.company ?? '', ctx.trigger ?? ''],
    followup: [ctx.name ?? '', ctx.topic ?? '', ctx.proof ?? ''],
    reengage: [ctx.name ?? '', ctx.update ?? ''],
    otp: [ctx.code ?? '', ctx.expiryMinutes ?? String(def.auth?.codeExpiryMinutes ?? 5)],
    order_confirmed: [ctx.name ?? '', ctx.orderRef ?? '', ctx.amount ?? ''],
    order_shipped: [ctx.name ?? '', ctx.orderRef ?? '', ctx.eta ?? '', ctx.tracking ?? ''],
    order_ready: [ctx.name ?? '', ctx.orderRef ?? '', ctx.branch ?? '', ctx.hours ?? ''],
  };
  return { def, params: map[key] ?? [] };
}

/** Build the Meta message_templates registration payload for one template. */
export function registrationPayload(def: TemplateDef, appUrl: string): Record<string, unknown> {
  // AUTHENTICATION templates have a Meta-fixed shape (no free body text).
  if (def.category === 'AUTHENTICATION' && def.auth) {
    return {
      name: def.name,
      language: def.language,
      category: 'AUTHENTICATION',
      components: [
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: def.auth.codeExpiryMinutes },
        { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: def.auth.buttonText }] },
      ],
    };
  }

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
  if (def.quickReply?.length) {
    components.push({
      type: 'BUTTONS',
      buttons: def.quickReply.map((text) => ({ type: 'QUICK_REPLY', text })),
    });
  }
  return { name: def.name, language: def.language, category: def.category, components };
}

export function allRegistrationPayloads(appUrl: string): Record<string, unknown>[] {
  return Object.values(TEMPLATES).map((d) => registrationPayload(d, appUrl));
}

/** Registration payloads for an explicit list of defs (built-in ∪ custom). */
export function registrationPayloadsFor(defs: TemplateDef[], appUrl: string): Record<string, unknown>[] {
  return defs.map((d) => registrationPayload(d, appUrl));
}

/** Generic params from a def + a flat context (used for custom templates whose keys
 *  aren't in the built-in templateParams map): fills {{n}} in declared order. */
export function paramsFromContext(def: TemplateDef, ctx: Record<string, string | undefined>): string[] {
  // ctx keys are matched to def.params by INDEX via ctx['1'], ctx['2']… or by the
  // param's own label; simplest contract: caller passes ctx['1']..ctx['n'].
  return def.params.map((_, i) => ctx[String(i + 1)] ?? '');
}
