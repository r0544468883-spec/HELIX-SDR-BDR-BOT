// Lifecycle runner — sends every reminder job that's due. Mirrors the executor:
// reuses the workspace's channel_bindings + sendWhatsApp. Wire to a Cron.
// NOTE (§30A / WhatsApp policy): these go to EXISTING, opted-in customers. Proactive
// business-initiated messages outside the 24h window require an APPROVED WhatsApp
// template — swap the text send for a template send once templates are approved.
import { supabaseAdmin } from '@/lib/helix/supabase';
import { sendWhatsApp } from '@/lib/channels/whatsapp';
import { renderTemplate, type Kind } from './templates';

type Job = { id: string; workspace_id: string; customer_id: string; kind: Kind; channel: string; meta: Record<string, unknown> };

export async function runLifecycle(limit = 50): Promise<{ sent: number; failed: number }> {
  const db = supabaseAdmin();
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  const nowIso = new Date().toISOString();

  const { data: jobs } = await db.from('lifecycle_jobs')
    .select('id, workspace_id, customer_id, kind, channel, meta')
    .eq('status', 'scheduled').lte('send_at', nowIso)
    .order('send_at', { ascending: true }).limit(limit);

  const bindingCache = new Map<string, Record<string, unknown>>();
  let sent = 0, failed = 0;

  for (const job of (jobs ?? []) as Job[]) {
    const { data: c } = await db.from('lifecycle_customers').select('name, phone, fields').eq('id', job.customer_id).maybeSingle();
    if (!c?.phone) { await mark(db, job.id, 'failed'); failed++; continue; }

    let config = bindingCache.get(job.workspace_id);
    if (!config) {
      const { data: b } = await db.from('channel_bindings').select('config').eq('workspace_id', job.workspace_id).eq('channel', 'whatsapp').maybeSingle();
      config = (b?.config ?? {}) as Record<string, unknown>;
      bindingCache.set(job.workspace_id, config);
    }

    const body = renderTemplate(job.kind, { name: c.name, fields: c.fields as Record<string, unknown> }, job.meta ?? {}, appUrl);
    const res = await sendWhatsApp(config, c.phone as string, body);
    await mark(db, job.id, res.ok ? 'sent' : 'failed', res.externalId);
    if (res.ok) sent++; else failed++;
  }
  return { sent, failed };
}

async function mark(db: ReturnType<typeof supabaseAdmin>, id: string, status: string, externalId?: string) {
  await db.from('lifecycle_jobs').update({ status, external_id: externalId ?? null }).eq('id', id).eq('status', 'scheduled');
}
