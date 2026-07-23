// Custom templates — upload your OWN templates for any message type.
//   GET    ?workspace=&kind=            → list custom templates
//   POST   { workspace_id?, kind, key, definition }   → upsert one
//   POST   { workspace_id?, templates: [{kind,key,definition}, ...] } → bulk upload
//   DELETE ?workspace=&kind=&key=       → remove one
// kind ∈ 'whatsapp' | 'email'. WhatsApp customs still need /api/templates/sync +
// Meta approval before they can send out-of-window.
import { NextRequest, NextResponse } from 'next/server';
import { listCustom, upsertCustom, deleteCustom, type CustomKind } from '@/lib/templates/custom';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ws(request: NextRequest, body?: { workspace_id?: string }): string | null {
  return body?.workspace_id || request.nextUrl.searchParams.get('workspace') || process.env.DEFAULT_WORKSPACE_ID || null;
}

export async function GET(request: NextRequest) {
  const workspaceId = ws(request);
  if (!workspaceId) return NextResponse.json({ error: 'workspace required' }, { status: 400 });
  const kind = (request.nextUrl.searchParams.get('kind') as CustomKind | null) ?? undefined;
  return NextResponse.json({ templates: await listCustom(workspaceId, kind ?? undefined) });
}

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null);
  const workspaceId = ws(request, b);
  if (!workspaceId) return NextResponse.json({ error: 'workspace required' }, { status: 400 });

  const batch: { kind: CustomKind; key: string; definition: unknown }[] =
    Array.isArray(b?.templates) ? b.templates : b?.kind ? [{ kind: b.kind, key: b.key, definition: b.definition }] : [];
  if (!batch.length) return NextResponse.json({ error: 'provide {kind,key,definition} or {templates:[...]}' }, { status: 400 });

  const results = [];
  for (const t of batch) {
    if (!t.kind || !t.key || !t.definition) { results.push({ key: t.key, ok: false, error: 'kind, key, definition required' }); continue; }
    const r = await upsertCustom(workspaceId, t.kind, t.key, t.definition);
    results.push({ key: t.key, ...r });
  }
  return NextResponse.json({ ok: results.every((r) => r.ok), saved: results.filter((r) => r.ok).length, results });
}

export async function DELETE(request: NextRequest) {
  const workspaceId = ws(request);
  const kind = request.nextUrl.searchParams.get('kind') as CustomKind | null;
  const key = request.nextUrl.searchParams.get('key');
  if (!workspaceId || !kind || !key) return NextResponse.json({ error: 'workspace, kind, key required' }, { status: 400 });
  await deleteCustom(workspaceId, kind, key);
  return NextResponse.json({ ok: true });
}
