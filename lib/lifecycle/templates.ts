// Hebrew message templates per lifecycle kind. Business-agnostic (the vet/pet
// brief is just one use-case): a "secondary entity" name (e.g. a pet) is pulled
// from customer.fields when present. Merge fields: {name} {entity} {date} {time}
// {product} {coupon} {confirm_url} {cancel_url} {title}.

export type Kind = 'appt_reminder' | 'appt_sameday' | 'renewal' | 'replenish' | 'birthday' | 'custom';

export type Customer = { name?: string | null; fields?: Record<string, unknown> | null };
export type Meta = Record<string, unknown>;

const T: Record<Kind, string> = {
  appt_reminder:
    'שלום {name} 👋 תזכורת: יש לך תור{entity_for} ל־{date} בשעה {time}.\nלאישור: {confirm_url}\nלביטול: {cancel_url}',
  appt_sameday:
    'בוקר טוב {name}! תזכורת אחרונה — התור{entity_for} היום בשעה {time}.\nלאישור: {confirm_url}\nלביטול: {cancel_url}',
  renewal:
    'שלום {name}, המנוי שלך מתקרב לחידוש. רוצה שנחדש אוטומטית? {coupon_line}',
  replenish:
    'היי {name} 🐾 עבר זמן מאז שרכשת {product}. אולי הגיע הזמן להזמנה חוזרת?{coupon_line}',
  birthday:
    'מזל טוב {entity}! 🎉 חוגגים יום הולדת — הכנו לך הטבה מיוחדת.{coupon_line}',
  custom: '{body}',
};

function entityName(c: Customer): string | undefined {
  const f = c.fields ?? {};
  return (f.pet_name as string) || (f.entity as string) || undefined;
}

export function renderTemplate(kind: Kind, customer: Customer, meta: Meta, appUrl: string): string {
  const entity = entityName(customer);
  const token = meta.appt_token as string | undefined;
  const coupon = meta.coupon as string | undefined;
  const map: Record<string, string> = {
    '{name}': customer.name || 'שלום',
    '{entity}': entity || customer.name || '',
    '{entity_for}': entity ? ` ל־${entity}` : '',
    '{date}': (meta.date as string) || '',
    '{time}': (meta.time as string) || '',
    '{product}': (meta.product as string) || '',
    '{title}': (meta.title as string) || '',
    '{coupon}': coupon || '',
    '{coupon_line}': coupon ? ` השתמש/י בקוד ${coupon} להטבה 🎁` : '',
    '{confirm_url}': token ? `${appUrl}/r/${token}?a=confirm` : '',
    '{cancel_url}': token ? `${appUrl}/r/${token}?a=cancel` : '',
    '{body}': (meta.body as string) || '',
  };
  return Object.entries(map).reduce((s, [k, v]) => s.split(k).join(v), T[kind]).trim();
}
