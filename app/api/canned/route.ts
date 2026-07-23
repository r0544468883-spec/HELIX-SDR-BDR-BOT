// Canned replies management (for the templates UI).
//   GET    ?workspace=              → merged list (defaults ∪ custom)
//   POST   { workspace_id?, key, body, title?, triggers? }  → upsert
//   DELETE ?workspace=&key=         → remove a custom canned reply
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/helix/supabase';
import { listCanned, upsertCanned } from '@/lib/canned/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ws(request: NextRequest, body?: { workspace_id?: string }): string | null {
  return body?.workspace_id || request.nextUrl.searchParams.get('workspace') || process.env.DEFAULT_WORKSPACE_ID || null;
}

export async function GET(request: NextRequest) {
  const workspaceId = ws(request);
  if (!workspaceId) return NextResponse.json({ error: 'workspace required' }, { status: 400 });
  return NextResponse.json({ canned: await listCanned(workspaceId) });
}

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null);
  const workspaceId = ws(request, b);
  if (!workspaceId || !b?.key || !b?.body) return NextResponse.json({ error: 'key and body required' }, { status: 400 });
  const triggers = Array.isArray(b.triggers)
    ? b.triggers
    : typeof b.triggers === 'string' ? b.triggers.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined;
  await upsertCanned(workspaceId, b.key, b.body, b.title, triggers);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const workspaceId = ws(request);
  const key = request.nextUrl.searchParams.get('key');
  if (!workspaceId || !key) return NextResponse.json({ error: 'workspace and key required' }, { status: 400 });
  await supabaseAdmin().from('canned_replies').delete().eq('workspace_id', workspaceId).eq('key', key);
  return NextResponse.json({ ok: true });
}
