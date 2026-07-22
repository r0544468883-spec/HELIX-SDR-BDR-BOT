// Lifecycle scheduler — creates the domain records (appointment / purchase) and
// schedules the corresponding reminder jobs. All server-side (admin client).
import { supabaseAdmin } from '@/lib/helix/supabase';

function token(): string { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function fmtDate(d: Date): string { return d.toLocaleDateString('he-IL'); }
function fmtTime(d: Date): string { return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); }

// Appointment → confirm token + two reminders: `advanceDays` before, and same-day AM.
export async function scheduleAppointment(input: {
  workspaceId: string; customerId: string; title?: string; scheduledAt: string; advanceDays?: number;
}) {
  const db = supabaseAdmin();
  const at = new Date(input.scheduledAt);
  const tok = token();
  const { data: appt, error } = await db.from('appointments')
    .insert({ workspace_id: input.workspaceId, customer_id: input.customerId, title: input.title ?? null, scheduled_at: at.toISOString(), status: 'pending', token: tok })
    .select('id').single();
  if (error || !appt) return { error: error?.message ?? 'insert_failed' };

  const meta = { appt_token: tok, date: fmtDate(at), time: fmtTime(at), title: input.title ?? '' };
  const advance = new Date(at.getTime() - (input.advanceDays ?? 1) * 86400000);
  const sameDay = new Date(at); sameDay.setHours(6, 0, 0, 0); // ~08:00 IL morning-of

  const jobs = [
    { kind: 'appt_reminder', send_at: advance.toISOString() },
    { kind: 'appt_sameday', send_at: sameDay.toISOString() },
  ].map((j) => ({ workspace_id: input.workspaceId, customer_id: input.customerId, kind: j.kind, channel: 'whatsapp', send_at: j.send_at, meta }));
  await db.from('lifecycle_jobs').insert(jobs);
  return { ok: true, appointmentId: appt.id, token: tok };
}

// Subscription renewal reminder (e.g. a month before renewal).
export async function scheduleRenewal(input: { workspaceId: string; customerId: string; sendAt: string; coupon?: string }) {
  const db = supabaseAdmin();
  await db.from('lifecycle_jobs').insert({
    workspace_id: input.workspaceId, customer_id: input.customerId, kind: 'renewal', channel: 'whatsapp',
    send_at: new Date(input.sendAt).toISOString(), meta: input.coupon ? { coupon: input.coupon } : {},
  });
  return { ok: true };
}

// Repeat-purchase / replenishment — records the purchase and schedules a reminder
// `replenishDays` later (e.g. food bought 30/90 days ago → time to reorder).
export async function scheduleReplenishment(input: {
  workspaceId: string; customerId: string; product: string; purchasedAt?: string; replenishDays: number; coupon?: string;
}) {
  const db = supabaseAdmin();
  const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();
  await db.from('purchases').insert({ workspace_id: input.workspaceId, customer_id: input.customerId, product: input.product, purchased_at: purchasedAt.toISOString(), replenish_days: input.replenishDays });
  const sendAt = new Date(purchasedAt.getTime() + input.replenishDays * 86400000);
  await db.from('lifecycle_jobs').insert({
    workspace_id: input.workspaceId, customer_id: input.customerId, kind: 'replenish', channel: 'whatsapp',
    send_at: sendAt.toISOString(), meta: { product: input.product, ...(input.coupon ? { coupon: input.coupon } : {}) },
  });
  return { ok: true };
}

// Birthday/anniversary — schedules the next occurrence for the customer or a linked
// entity (e.g. a pet). `dateStr` is a yyyy-mm-dd; year is rolled to the next one.
export async function scheduleBirthday(input: { workspaceId: string; customerId: string; dateStr: string; coupon?: string; who?: 'customer' | 'entity' }) {
  const db = supabaseAdmin();
  const [, m, d] = input.dateStr.split('-').map(Number);
  const now = new Date();
  let next = new Date(now.getFullYear(), (m || 1) - 1, d || 1, 6, 0, 0);
  if (next.getTime() < now.getTime()) next = new Date(now.getFullYear() + 1, (m || 1) - 1, d || 1, 6, 0, 0);
  await db.from('lifecycle_jobs').insert({
    workspace_id: input.workspaceId, customer_id: input.customerId, kind: 'birthday', channel: 'whatsapp',
    send_at: next.toISOString(), meta: { who: input.who ?? 'customer', ...(input.coupon ? { coupon: input.coupon } : {}) },
  });
  return { ok: true };
}
