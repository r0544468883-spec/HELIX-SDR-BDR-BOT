// Handle inbound QUICK-REPLY button taps (from template quick_reply buttons).
// The payload is self-describing (set at send time in the runner), so no lookup
// of "which button" is needed — we parse the intent straight from the payload.
//   confirm:<token> | cancel:<token>       → appointment confirm/cancel
//   reorder_yes:<customerId>:<product>     → repeat purchase accepted
//   reorder_no:<customerId>                → declined (acknowledge)
import { supabaseAdmin } from '@/lib/helix/supabase';

/** Returns a reply string to send back to the customer, or null if not a known action. */
export async function applyButtonAction(payload: string): Promise<string | null> {
  const db = supabaseAdmin();
  const [action, ...rest] = payload.split(':');

  if (action === 'confirm' || action === 'cancel') {
    const token = rest[0];
    if (!token) return null;
    const { data: appt } = await db.from('appointments').select('id, customer_id').eq('token', token).maybeSingle();
    if (!appt) return 'הקישור אינו בתוקף.';
    await db.from('appointments').update({ status: action === 'confirm' ? 'confirmed' : 'cancelled' }).eq('id', appt.id);
    if (action === 'cancel') {
      await db.from('lifecycle_jobs').update({ status: 'cancelled' })
        .eq('customer_id', appt.customer_id).eq('status', 'scheduled')
        .in('kind', ['appt_reminder', 'appt_sameday']);
      return 'התור בוטל בהצלחה. נשמח לראותך בפעם אחרת 💙';
    }
    return 'תודה! התור אושר. נתראה 🙌';
  }

  if (action === 'reorder_yes') {
    const [customerId, product] = rest;
    if (customerId && product) {
      const { data: c } = await db.from('lifecycle_customers').select('workspace_id').eq('id', customerId).maybeSingle();
      if (c?.workspace_id) {
        await db.from('purchases').insert({ workspace_id: c.workspace_id, customer_id: customerId, product, purchased_at: new Date().toISOString() });
      }
    }
    return 'מעולה! נטפל בהזמנה החוזרת ונחזור אליך עם הפרטים 🛍️';
  }
  if (action === 'reorder_no') {
    return 'סבבה, תודה! נהיה כאן כשתצטרך/י 🙂';
  }
  return null;
}
