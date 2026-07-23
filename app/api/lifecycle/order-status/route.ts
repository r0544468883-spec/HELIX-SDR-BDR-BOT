// POST /api/lifecycle/order-status — send an order-status update over WhatsApp.
// Body: { workspace_id?, phone, name?, status: 'confirmed'|'shipped'|'ready',
//         order_ref, amount?, eta?, tracking?, branch?, hours? }
import { NextRequest, NextResponse } from 'next/server';
import { sendOrderStatus, type OrderStatus } from '@/lib/lifecycle/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null);
  const workspaceId = b?.workspace_id || process.env.DEFAULT_WORKSPACE_ID;
  if (!workspaceId || !b?.phone || !b?.status || !b?.order_ref) {
    return NextResponse.json({ error: 'workspace_id, phone, status, order_ref required' }, { status: 400 });
  }
  if (!['confirmed', 'shipped', 'ready'].includes(b.status)) {
    return NextResponse.json({ error: 'status must be confirmed|shipped|ready' }, { status: 400 });
  }
  const r = await sendOrderStatus({
    workspaceId, phone: b.phone, name: b.name, status: b.status as OrderStatus, orderRef: b.order_ref,
    amount: b.amount, eta: b.eta, tracking: b.tracking, branch: b.branch, hours: b.hours,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
