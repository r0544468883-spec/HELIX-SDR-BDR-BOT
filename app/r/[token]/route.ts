// GET /r/[token]?a=confirm|cancel — public confirm/cancel link from a reminder.
// No auth (the unguessable token is the credential). Confirms/cancels the
// appointment; cancelling also cancels its still-pending same-day reminder.
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/helix/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page(title: string, body: string, buttons?: string): Response {
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0b0f14;color:#e8eef5;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#141b24;border:1px solid #1f2a36;border-radius:16px;padding:40px;max-width:360px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#9fb0c3;margin:0 0 20px;line-height:1.6}
.row{display:flex;gap:12px;justify-content:center}
a.btn{display:inline-block;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600}
.ok{background:#1f6feb;color:#fff}.no{background:#22303c;color:#e8eef5}
</style></head><body><div class="card">
<h1>${title}</h1><p>${body}</p>${buttons ?? ''}</div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const action = request.nextUrl.searchParams.get('a');

  const db = supabaseAdmin();
  const { data: appt } = await db.from('appointments').select('id, workspace_id, customer_id, status').eq('token', token).maybeSingle();
  if (!appt) return page('לא נמצא', 'הקישור פג תוקף או שאינו קיים.');

  // No action yet (template URL button lands here) → show a chooser.
  if (action !== 'confirm' && action !== 'cancel') {
    const enc = encodeURIComponent(token);
    return page('אישור התור', 'תרצו לאשר את התור או לבטל אותו?',
      `<div class="row"><a class="btn ok" href="/r/${enc}?a=confirm">אישור התור</a><a class="btn no" href="/r/${enc}?a=cancel">ביטול</a></div>`);
  }

  const status = action === 'confirm' ? 'confirmed' : 'cancelled';
  await db.from('appointments').update({ status }).eq('id', appt.id);

  if (action === 'cancel') {
    // Drop any still-pending reminders for this appointment.
    await db.from('lifecycle_jobs').update({ status: 'cancelled' })
      .eq('customer_id', appt.customer_id).eq('status', 'scheduled')
      .in('kind', ['appt_reminder', 'appt_sameday']);
    return page('התור בוטל', 'התור בוטל בהצלחה. נשמח לראותך בפעם אחרת 💙');
  }
  return page('התור אושר', 'תודה! התור שלך אושר. נתראה 🙌');
}
