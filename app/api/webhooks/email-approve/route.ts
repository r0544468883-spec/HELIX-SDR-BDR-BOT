// Email reply-to-approve — the [approve]/[reject] links in approval emails land here.
// GET /api/webhooks/email-approve?d=approve:<uuid>
import { NextRequest, NextResponse } from 'next/server';
import { decideApproval } from '@/lib/helix/notify';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const d = request.nextUrl.searchParams.get('d') ?? '';
  const [action, approvalId] = d.split(':');
  if ((action !== 'approve' && action !== 'reject') || !approvalId) {
    return new NextResponse('Invalid link', { status: 400 });
  }
  const status = await decideApproval(approvalId, action === 'approve' ? 'approve' : 'reject');
  const msg =
    status === 'approved' ? 'אושר ✅ — הפעולה תישלח.' :
    status === 'rejected' ? 'נדחה ✋ — לא יישלח.' :
    'הפריט כבר טופל.';
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:48px" dir="rtl"><h2>${msg}</h2><p>אפשר לסגור את החלון.</p></body>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
