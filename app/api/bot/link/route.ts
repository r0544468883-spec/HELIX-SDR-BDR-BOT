// Operator identity linking — connect a WhatsApp number to a workspace so the bot
// routes that sender's messages to the OPERATOR command flow (schedule/import/stats)
// instead of the lead auto-reply flow. Writes the same bot_links row the inbound
// webhook reads (resolveOperatorWorkspace → bot_links.channel + .identifier).
//   GET    ?workspace=            → current WhatsApp operator numbers
//   POST   { workspace_id?, phone } → link (upsert on channel+identifier)
//   DELETE ?workspace=&phone=     → unlink
// Meta delivers the sender (`from`) as bare international digits (e.g. 972501234567),
// so we store the identifier the same way: digits only, leading 00 stripped.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/helix/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ws(request: NextRequest, body?: { workspace_id?: string }): string | null {
  return body?.workspace_id || request.nextUrl.searchParams.get('workspace') || process.env.DEFAULT_WORKSPACE_ID || null;
}

const normalize = (phone: string) => phone.replace(/\D/g, '').replace(/^00/, '');

export async function GET(request: NextRequest) {
  const workspaceId = ws(request);
  if (!workspaceId) return NextResponse.json({ error: 'workspace required' }, { status: 400 });
  const { data } = await supabaseAdmin()
    .from('bot_links').select('identifier').eq('workspace_id', workspaceId).eq('channel', 'whatsapp');
  return NextResponse.json({ links: (data ?? []).map((r) => r.identifier as string) });
}

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null);
  const workspaceId = ws(request, b);
  const identifier = b?.phone ? normalize(String(b.phone)) : '';
  if (!workspaceId || !identifier) return NextResponse.json({ error: 'workspace and phone required' }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from('bot_links')
    .upsert({ workspace_id: workspaceId, channel: 'whatsapp', identifier, role: 'operator' }, { onConflict: 'channel,identifier' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, identifier });
}

export async function DELETE(request: NextRequest) {
  const workspaceId = ws(request);
  const phone = request.nextUrl.searchParams.get('phone');
  if (!workspaceId || !phone) return NextResponse.json({ error: 'workspace and phone required' }, { status: 400 });
  await supabaseAdmin().from('bot_links').delete()
    .eq('workspace_id', workspaceId).eq('channel', 'whatsapp').eq('identifier', normalize(phone));
  return NextResponse.json({ ok: true });
}
