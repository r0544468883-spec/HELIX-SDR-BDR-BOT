// Lifecycle runner — sends every reminder job that's due. Mirrors the executor:
// reuses the workspace's channel_bindings + sendWhatsApp. Wire to a Cron.
// NOTE (§30A / WhatsApp policy): these go to EXISTING, opted-in customers. Proactive
// business-initiated messages outside the 24h window require an APPROVED WhatsApp
// template — swap the text send for a template send once templates are approved.
import { supabaseAdmin } from '@/lib/helix/supabase';
import { sendWhatsApp, sendWhatsAppTemplate } from '@/lib/channels/whatsapp';
import { renderTemplate, renderContext, type Kind } from './templates';
import { templateParams } from '@/lib/templates/catalog';
import { mergedWhatsAppTemplates } from '@/lib/templates/custom';
import type { ChannelConfig } from '@/lib/channels/types';

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
  const tplCache = new Map<string, Record<string, import('@/lib/templates/catalog').TemplateDef>>();
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

    const customer = { name: c.name, fields: c.fields as Record<string, unknown> };
    const meta = job.meta ?? {};
    // Proactive by nature → prefer an APPROVED template (compliant out-of-window).
    // If the template isn't approved yet, fall back to free-text (works in-window).
    const ctx = renderContext(customer, meta);
    // Prefer QUICK-REPLY templates for actions the customer can take in one tap
    // (confirm/cancel appointment, reorder). The payload is self-describing so the
    // button tap lands on the webhook ready to process — no public page round-trip.
    const isAppt = job.kind === 'appt_reminder' || job.kind === 'appt_sameday';
    const isReplenish = job.kind === 'replenish';
    let key: string = job.kind;
    let quickReplies: string[] | undefined;
    if (isAppt && ctx.token) {
      key = 'appt_confirm_qr';
      quickReplies = [`confirm:${ctx.token}`, `cancel:${ctx.token}`];
    } else if (isReplenish) {
      key = 'reorder_qr';
      quickReplies = [`reorder_yes:${job.customer_id}:${ctx.product}`, `reorder_no:${job.customer_id}`];
    }
    const tpl = templateParams(key, { ...ctx, entityFor: ctx.entityFor });
    // Custom override: if the workspace uploaded its OWN template for this key, use
    // its name/language/buttons (params stay from the built-in mapping for this kind).
    if (tpl) {
      let merged = tplCache.get(job.workspace_id);
      if (!merged) { merged = await mergedWhatsAppTemplates(job.workspace_id); tplCache.set(job.workspace_id, merged); }
      if (merged[key] && merged[key].name !== tpl.def.name) tpl.def = merged[key];
    }
    let res;
    if (tpl) {
      if (!tpl.def.quickReply?.length) quickReplies = undefined;
      res = await sendWhatsAppTemplate(config as ChannelConfig, c.phone as string, tpl.def.name, tpl.def.language, tpl.params, tpl.def.urlButton ? ctx.token : undefined, quickReplies);
      if (!res.ok && /template|not found|does not exist|132001|param/i.test(res.error ?? '')) {
        res = await sendWhatsApp(config as ChannelConfig, c.phone as string, renderTemplate(job.kind, customer, meta, appUrl));
      }
    } else {
      res = await sendWhatsApp(config as ChannelConfig, c.phone as string, renderTemplate(job.kind, customer, meta, appUrl));
    }
    await mark(db, job.id, res.ok ? 'sent' : 'failed', res.externalId);
    if (res.ok) sent++; else failed++;
  }
  return { sent, failed };
}

async function mark(db: ReturnType<typeof supabaseAdmin>, id: string, status: string, externalId?: string) {
  await db.from('lifecycle_jobs').update({ status, external_id: externalId ?? null }).eq('id', id).eq('status', 'scheduled');
}
