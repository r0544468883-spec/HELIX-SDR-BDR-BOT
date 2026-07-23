// GET /api/templates/list?workspace= — merged catalog for the management UI:
// WhatsApp (built-in ∪ custom), email (built-in ∪ custom), canned (defaults ∪ custom).
// Each item is tagged source: 'builtin' | 'custom' so the UI can mark overrides.
import { NextRequest, NextResponse } from 'next/server';
import { TEMPLATES } from '@/lib/templates/catalog';
import { EMAIL_TEMPLATES } from '@/lib/templates/email-catalog';
import { mergedWhatsAppTemplates, mergedEmailTemplates, listCustom } from '@/lib/templates/custom';
import { listCanned } from '@/lib/canned/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspace') || process.env.DEFAULT_WORKSPACE_ID;
  if (!workspaceId) return NextResponse.json({ error: 'workspace required' }, { status: 400 });

  const builtinWa = new Set(Object.keys(TEMPLATES));
  const builtinEmail = new Set(EMAIL_TEMPLATES.map((t) => t.key));

  const [waMerged, emailMerged, waCustomRows, emailCustomRows, canned] = await Promise.all([
    mergedWhatsAppTemplates(workspaceId),
    mergedEmailTemplates(workspaceId),
    listCustom(workspaceId, 'whatsapp'),
    listCustom(workspaceId, 'email'),
    listCanned(workspaceId),
  ]);
  const waCustomKeys = new Set(waCustomRows.map((r) => (r as { key: string }).key));
  const emailCustomKeys = new Set(emailCustomRows.map((r) => (r as { key: string }).key));

  const whatsapp = Object.entries(waMerged).map(([key, d]) => ({
    key, name: d.name, language: d.language, category: d.category, body: d.body,
    params: d.params, sampleParams: d.sampleParams,
    quickReply: d.quickReply ?? null, urlButton: d.urlButton ?? null, auth: d.auth ?? null,
    source: waCustomKeys.has(key) ? 'custom' : 'builtin',
    overrides: waCustomKeys.has(key) && builtinWa.has(key),
  }));

  const email = Object.entries(emailMerged).map(([key, t]) => ({
    key, title: t.title, step: t.step, subject: t.subject, body: t.body,
    source: emailCustomKeys.has(key) ? 'custom' : 'builtin',
    overrides: emailCustomKeys.has(key) && builtinEmail.has(key),
  })).sort((a, b) => a.step - b.step);

  return NextResponse.json({ whatsapp, email, canned });
}
