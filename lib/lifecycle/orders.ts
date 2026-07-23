// Order-status updates over WhatsApp (order_confirmed / order_shipped / order_ready).
// Stateless: the business's own system supplies the order data per call — we just
// deliver the compliant template (free-text fallback in-window).
import { supabaseAdmin } from '@/lib/helix/supabase';
import { sendWhatsAppTemplate, sendWhatsApp } from '@/lib/channels/whatsapp';
import { templateParams } from '@/lib/templates/catalog';
import type { ChannelConfig } from '@/lib/channels/types';

export type OrderStatus = 'confirmed' | 'shipped' | 'ready';
const KEY: Record<OrderStatus, string> = { confirmed: 'order_confirmed', shipped: 'order_shipped', ready: 'order_ready' };

export type OrderInput = {
  workspaceId: string;
  phone: string;
  name?: string;
  status: OrderStatus;
  orderRef: string;
  amount?: string;   // confirmed
  eta?: string;      // shipped
  tracking?: string; // shipped
  branch?: string;   // ready
  hours?: string;    // ready
};

export async function sendOrderStatus(input: OrderInput): Promise<{ ok: boolean; error?: string }> {
  const db = supabaseAdmin();
  const { data } = await db.from('channel_bindings').select('config').eq('workspace_id', input.workspaceId).eq('channel', 'whatsapp').maybeSingle();
  const config = (data?.config ?? {}) as ChannelConfig;

  const key = KEY[input.status];
  const tpl = templateParams(key, {
    name: input.name, orderRef: input.orderRef, amount: input.amount,
    eta: input.eta, tracking: input.tracking, branch: input.branch, hours: input.hours,
  });
  if (!tpl) return { ok: false, error: 'unknown_status' };

  let res = await sendWhatsAppTemplate(config, input.phone, tpl.def.name, tpl.def.language, tpl.params);
  if (!res.ok && /template|not found|does not exist|132001|param/i.test(res.error ?? '')) {
    // In-window free-text fallback mirrors the template copy.
    const fallback: Record<OrderStatus, string> = {
      confirmed: `שלום ${input.name ?? ''} 🎉 הזמנה ${input.orderRef} התקבלה! סה״כ: ${input.amount ?? ''}.`,
      shipped: `📦 ${input.name ?? ''}, הזמנה ${input.orderRef} יצאה לדרך! אספקה: ${input.eta ?? ''}. מעקב: ${input.tracking ?? ''}.`,
      ready: `שלום ${input.name ?? ''}, הזמנה ${input.orderRef} מוכנה לאיסוף ב${input.branch ?? ''} 🛍️ ${input.hours ?? ''}.`,
    };
    res = await sendWhatsApp(config, input.phone, fallback[input.status].trim());
  }
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
