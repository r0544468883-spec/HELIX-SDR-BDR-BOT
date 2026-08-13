// POST /api/outreach — the end-to-end SDR slice (event source for the approval loop):
//   enrich (waterfall) → draft personalized message (Claude) → enqueue for approval → notify user.
// Body: { workspaceId, input: WaterfallInput, offer, channel, recipient, language?, contactId? }
import { NextRequest, NextResponse } from 'next/server';
import { runWaterfall } from '@/lib/waterfall/orchestrator';
import type { FieldName, WaterfallInput } from '@/lib/waterfall/types';
import { composeOutreach } from '@/lib/agents/sdr/department-chief';
import { enqueueApproval } from '@/lib/helix/notify';
import { approveAndRun } from '@/lib/helix/executor';
import { resolveMode } from '@/lib/autonomy/resolve';
import { adminStore } from '@/lib/autonomy/store';

export const runtime = 'nodejs';

const COMPANY_FIELDS: FieldName[] = ['company_name', 'industry', 'tech_stack', 'description'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, offer, recipient } = body;
    const input: WaterfallInput = body.input ?? {};
    const channel: 'email' | 'whatsapp' | 'telegram' = body.channel ?? 'email';
    const language: 'he' | 'en' = body.language ?? 'he';

    if (!workspaceId || !offer || !recipient) {
      return NextResponse.json({ error: 'workspaceId, offer and recipient are required' }, { status: 400 });
    }
    if (!input.domain && !input.companyName) {
      return NextResponse.json({ error: 'input.domain or input.companyName is required' }, { status: 400 });
    }

    // 1) Enrich (own-first waterfall) — company context for personalization.
    const enrich = await runWaterfall(input, COMPANY_FIELDS, {
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
      byoKeys: body.byoKeys ?? {},
      contactId: body.contactId,
    });
    const f = (name: FieldName) => enrich.results.find((r) => r.field === name)?.value ?? undefined;

    // 2) Draft via the drafting department: Strategist → Writer → Critic → Editor.
    const draft = await composeOutreach({
      fullName: input.fullName,
      title: body.title,
      company: f('company_name') ?? input.companyName,
      industry: f('industry'),
      techStack: f('tech_stack'),
      hooks: body.hooks,
      offer,
      language,
      channel,
    });

    // 3) Route through the autonomy switch. Cold outreach never just "displays"
    //    (the endpoint's job is to queue an action), so advisor collapses to
    //    'approve' — the safe baseline. 'autopilot' (send immediately) is reached
    //    ONLY when sdr.outreach is explicitly set to autopilot with risk_ack=true;
    //    the guard downgrades otherwise. trust_level alone never auto-sends cold.
    const composed = draft.subject ? `נושא: ${draft.subject}\n\n${draft.body}` : draft.body;
    const resolved = await resolveMode(adminStore(), workspaceId, 'sdr.outreach');
    const mode: 'approve' | 'autopilot' = resolved === 'autopilot' ? 'autopilot' : 'approve';

    const approvalId = await enqueueApproval({
      workspaceId,
      kind: 'send_message',
      title: `טיוטת פנייה מוכנה ל-${input.fullName ?? recipient} (${channel})`,
      body: composed,
      targetRef: recipient,   // the LEAD recipient (email / phone / chat_id)
      channel,                // how the action is executed to the lead
    });

    // Autopilot: the outreach Critic vets the copy, then approve + dispatch now.
    // If the Critic holds it, the item stays 'pending' for the user's ✓.
    let autopilotSent = false;
    let heldByCritic = false;
    let heldNote: string | undefined;
    if (mode === 'autopilot' && approvalId) {
      const r = await approveAndRun(approvalId);
      autopilotSent = r.sent;
      heldByCritic = !!r.heldByCritic;
      heldNote = r.note;
    }

    return NextResponse.json({
      ok: true,
      approvalId,
      mode,                          // 'approve' (awaiting ✓) | 'autopilot' (sent unless held)
      autopilotSent,
      heldByCritic,                  // autopilot send blocked by the outreach Critic → awaiting ✓
      heldNote,
      draft,
      enrichment: enrich.results,
      unresolved: enrich.unresolved,
      aiFlag: draft.aiScore > 70,   // high = sounds AI; user should review
    });
  } catch (error) {
    console.error('[api/outreach] error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Outreach failed' }, { status: 500 });
  }
}
