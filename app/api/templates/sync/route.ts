// POST /api/templates/sync?secret=... — registers every WhatsApp template in the
// catalog on the workspace's WABA (Meta message_templates). Idempotent: templates
// that already exist are treated as OK. Run once after setting up the WABA, and
// again whenever the catalog changes. Templates then need Meta APPROVAL (async).
// Body (optional): { workspace_id } — defaults to DEFAULT_WORKSPACE_ID.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/helix/supabase';
import { createWhatsAppTemplate } from '@/lib/channels/whatsapp';
import { allRegistrationPayloads } from '@/lib/templates/catalog';
import type { ChannelConfig } from '@/lib/channels/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.EXECUTOR_SECRET;
  const provided = request.nextUrl.searchParams.get('secret');
  if (secret && provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const workspaceId = body?.workspace_id || process.env.DEFAULT_WORKSPACE_ID;
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if (!workspaceId) return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: binding } = await db.from('channel_bindings').select('config').eq('workspace_id', workspaceId).eq('channel', 'whatsapp').maybeSingle();
  const config = (binding?.config ?? {}) as ChannelConfig & { waba_id?: string };
  const wabaId = config.waba_id as string | undefined;
  if (!wabaId) return NextResponse.json({ error: 'waba_id missing in channel_bindings config (add it to register templates)' }, { status: 400 });

  const results: { name: unknown; ok: boolean; status?: string; error?: string }[] = [];
  for (const payload of allRegistrationPayloads(appUrl)) {
    const r = await createWhatsAppTemplate(config, wabaId, payload);
    results.push({ name: payload.name, ok: r.ok, status: r.status, error: r.error });
  }
  return NextResponse.json({ ok: true, registered: results.filter((r) => r.ok).length, total: results.length, results });
}
