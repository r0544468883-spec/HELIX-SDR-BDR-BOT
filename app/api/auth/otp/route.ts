// OTP over WhatsApp — customer verification via the AUTHENTICATION template.
// POST { action: 'send', workspace_id?, phone }              → sends a code
// POST { action: 'verify', workspace_id?, phone, code }       → verifies a code
import { NextRequest, NextResponse } from 'next/server';
import { sendOtp, verifyOtp } from '@/lib/lifecycle/otp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null);
  const workspaceId = b?.workspace_id || process.env.DEFAULT_WORKSPACE_ID;
  const phone = b?.phone;
  if (!workspaceId || !phone) return NextResponse.json({ error: 'workspace_id and phone required' }, { status: 400 });

  if (b.action === 'send') {
    const r = await sendOtp(workspaceId, phone);
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  }
  if (b.action === 'verify') {
    if (!b.code) return NextResponse.json({ error: 'code required' }, { status: 400 });
    const r = await verifyOtp(workspaceId, phone, b.code);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  return NextResponse.json({ error: 'action must be send|verify' }, { status: 400 });
}
