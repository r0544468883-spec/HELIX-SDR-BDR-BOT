// POST /api/outreach/cold-email — render a cold-email template and enqueue it for
// approval (HITL). On approval the executor sends it via the workspace email config.
// Body: { workspace_id?, to, template, ctx?: {name,company,trigger,value,proof,cta,sender} }
//   template ∈ cold_opener | bump | value | breakup
import { NextRequest, NextResponse } from 'next/server';
import { enqueueApproval } from '@/lib/helix/notify';
import { renderEmail, packEmail } from '@/lib/templates/email-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null);
  const workspaceId = b?.workspace_id || process.env.DEFAULT_WORKSPACE_ID;
  if (!workspaceId || !b?.to || !b?.template) {
    return NextResponse.json({ error: 'workspace_id, to, template required' }, { status: 400 });
  }
  const rendered = renderEmail(b.template, b.ctx ?? {});
  if (!rendered) return NextResponse.json({ error: 'unknown template' }, { status: 400 });

  const id = await enqueueApproval({
    workspaceId, kind: 'send_message',
    title: `מייל קר ל-${b.to}: ${rendered.subject}`,
    body: packEmail(rendered.subject, rendered.body),
    targetRef: b.to, channel: 'email',
  });
  return NextResponse.json({ ok: true, approvalId: id, subject: rendered.subject });
}
