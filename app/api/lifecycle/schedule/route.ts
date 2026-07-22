// POST /api/lifecycle/schedule — create a domain event and auto-schedule its reminders.
// Body: { workspace_id, customer_id, type, ... }
//   type: 'appointment' { title?, scheduled_at, advance_days? }
//   type: 'renewal'     { send_at, coupon? }
//   type: 'replenish'   { product, purchased_at?, replenish_days, coupon? }
//   type: 'birthday'    { date, who?, coupon? }
import { NextRequest, NextResponse } from 'next/server';
import { scheduleAppointment, scheduleRenewal, scheduleReplenishment, scheduleBirthday } from '@/lib/lifecycle/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null);
  const workspaceId = b?.workspace_id, customerId = b?.customer_id;
  if (!workspaceId || !customerId) return NextResponse.json({ error: 'workspace_id and customer_id required' }, { status: 400 });

  try {
    switch (b.type) {
      case 'appointment': {
        if (!b.scheduled_at) return NextResponse.json({ error: 'scheduled_at required' }, { status: 400 });
        const r = await scheduleAppointment({ workspaceId, customerId, title: b.title, scheduledAt: b.scheduled_at, advanceDays: b.advance_days });
        return NextResponse.json(r);
      }
      case 'renewal':
        if (!b.send_at) return NextResponse.json({ error: 'send_at required' }, { status: 400 });
        return NextResponse.json(await scheduleRenewal({ workspaceId, customerId, sendAt: b.send_at, coupon: b.coupon }));
      case 'replenish':
        if (!b.product || !b.replenish_days) return NextResponse.json({ error: 'product and replenish_days required' }, { status: 400 });
        return NextResponse.json(await scheduleReplenishment({ workspaceId, customerId, product: b.product, purchasedAt: b.purchased_at, replenishDays: b.replenish_days, coupon: b.coupon }));
      case 'birthday':
        if (!b.date) return NextResponse.json({ error: 'date required' }, { status: 400 });
        return NextResponse.json(await scheduleBirthday({ workspaceId, customerId, dateStr: b.date, who: b.who, coupon: b.coupon }));
      default:
        return NextResponse.json({ error: 'unknown type' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
