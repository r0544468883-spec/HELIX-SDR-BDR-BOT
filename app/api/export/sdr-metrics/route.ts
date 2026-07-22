// Cross-product export — HELIX DASHBOARDS pulls SDR + lifecycle metrics from here
// into its metric_points (connector 'helix_sdr'). Secret-protected, standalone-safe.
// GET ?workspace=<id>&secret=<EXPORT_SECRET>
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/helix/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function count(db: ReturnType<typeof supabaseAdmin>, table: string, ws: string, filters: [string, string][] = []) {
  let q = db.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
  for (const [k, v] of filters) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.EXPORT_SECRET;
  const provided = url.searchParams.get('secret') || req.headers.get('x-export-secret');
  if (secret && provided !== secret) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ws = url.searchParams.get('workspace');
  if (!ws) return NextResponse.json({ error: 'workspace_required' }, { status: 400 });

  const db = supabaseAdmin();
  const [contacts, customers, apptConfirmed, apptCancelled, apptPending, remindersSent, remindersFailed, remindersDue] = await Promise.all([
    count(db, 'contacts', ws),
    count(db, 'lifecycle_customers', ws),
    count(db, 'appointments', ws, [['status', 'confirmed']]),
    count(db, 'appointments', ws, [['status', 'cancelled']]),
    count(db, 'appointments', ws, [['status', 'pending']]),
    count(db, 'lifecycle_jobs', ws, [['status', 'sent']]),
    count(db, 'lifecycle_jobs', ws, [['status', 'failed']]),
    count(db, 'lifecycle_jobs', ws, [['status', 'scheduled']]),
  ]);

  const apptTotalDecided = apptConfirmed + apptCancelled;
  const confirmRate = apptTotalDecided ? Math.round((apptConfirmed / apptTotalDecided) * 1000) / 10 : 0;

  const points = [
    { metric: 'sdr_contacts', dims: {}, value: contacts },
    { metric: 'sdr_lifecycle_customers', dims: {}, value: customers },
    { metric: 'sdr_appt_confirmed', dims: {}, value: apptConfirmed },
    { metric: 'sdr_appt_cancelled', dims: {}, value: apptCancelled },
    { metric: 'sdr_appt_pending', dims: {}, value: apptPending },
    { metric: 'sdr_appt_confirm_rate', dims: {}, value: confirmRate },
    { metric: 'sdr_reminders_sent', dims: {}, value: remindersSent },
    { metric: 'sdr_reminders_failed', dims: {}, value: remindersFailed },
    { metric: 'sdr_reminders_due', dims: {}, value: remindersDue },
  ];
  return NextResponse.json({ points });
}
