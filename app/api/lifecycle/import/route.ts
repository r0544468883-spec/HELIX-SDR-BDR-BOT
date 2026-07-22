// POST /api/lifecycle/import — bulk-load existing customers (from Excel/registration).
// Body: { workspace_id, customers: [{ name, phone, email, birthday?, fields?, source? }] }
//   or  { workspace_id, csv: "name,phone,email,birthday,pet_name,pet_birthday\n..." }
// Auto-schedules birthday reminders when a birthday (customer or pet) is present.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/helix/supabase';
import { scheduleBirthday } from '@/lib/lifecycle/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { name?: string; phone?: string; email?: string; birthday?: string; fields?: Record<string, unknown>; source?: string };

function parseCsv(csv: string): Row[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const rec: Record<string, string> = {};
    head.forEach((h, i) => { rec[h] = (cells[i] ?? '').trim(); });
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (!['name', 'phone', 'email', 'birthday'].includes(k) && v) fields[k] = v;
    }
    return { name: rec.name, phone: rec.phone, email: rec.email, birthday: rec.birthday || undefined, fields, source: 'import' };
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const workspaceId = body?.workspace_id;
  if (!workspaceId) return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });

  const rows: Row[] = Array.isArray(body?.customers) ? body.customers : body?.csv ? parseCsv(body.csv) : [];
  if (!rows.length) return NextResponse.json({ error: 'no customers' }, { status: 400 });

  const db = supabaseAdmin();
  const payload = rows
    .filter((r) => r.phone || r.email)
    .map((r) => ({ workspace_id: workspaceId, name: r.name ?? null, phone: r.phone ?? null, email: r.email ?? null, birthday: r.birthday ?? null, fields: r.fields ?? {}, source: r.source ?? 'import' }));

  const { data: inserted, error } = await db.from('lifecycle_customers').insert(payload).select('id, birthday, fields');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-schedule birthday reminders (customer + linked entity, e.g. a pet).
  let scheduled = 0;
  for (const c of inserted ?? []) {
    if (c.birthday) { await scheduleBirthday({ workspaceId, customerId: c.id, dateStr: String(c.birthday), who: 'customer' }); scheduled++; }
    const petBday = (c.fields as Record<string, unknown> | null)?.pet_birthday;
    if (typeof petBday === 'string' && /^\d{4}-\d{2}-\d{2}/.test(petBday)) {
      await scheduleBirthday({ workspaceId, customerId: c.id, dateStr: petBday, who: 'entity' }); scheduled++;
    }
  }
  return NextResponse.json({ ok: true, imported: inserted?.length ?? 0, birthdaysScheduled: scheduled });
}
