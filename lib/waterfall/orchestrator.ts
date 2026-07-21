// HELIX SDR-BDR-BOT — Waterfall orchestrator (own-first, vendor-fallback).
// Spec §4: walk providers by layer (own → vendor), stop per-field on first verified hit,
// record resolved_by + confidence + source + cost (charge-on-hit), persist to enrichment_fields.
import { supabaseAdmin } from '@/lib/helix/supabase';
import type { Provider, WaterfallInput, FieldName, FieldResult, ProviderContext } from './types';
import { cacheProvider } from './providers/cache';
import { scrapeCompanyProvider } from './providers/scrape-company';
import { emailVerifyProvider } from './providers/email-verify';
import { apolloProvider } from './providers/vendor-apollo';

/**
 * Default provider order — OWN-FIRST. Cache → own sources (cost 0) → vendor (BYO, charge-on-hit).
 * Vendors are only consulted for fields still unresolved after the own layer.
 */
const DEFAULT_ORDER: Provider[] = [
  cacheProvider,          // layer 1 — never re-pay for fresh data
  scrapeCompanyProvider,  // layer 1 — company fields from the site
  emailVerifyProvider,    // layer 1 — work_email via permutation+MX
  apolloProvider,         // layer 2 — BYO-key fallback for verified mobile / hard emails
];

export interface WaterfallRunResult {
  results: FieldResult[];
  totalCost: number;
  unresolved: FieldName[];
}

/**
 * Run the waterfall for one target over the requested fields.
 * @param persistContactId  when set, results are upserted into enrichment_fields.
 */
export async function runWaterfall(
  input: WaterfallInput,
  fields: FieldName[],
  ctx: ProviderContext,
  order: Provider[] = DEFAULT_ORDER,
): Promise<WaterfallRunResult> {
  const resolved = new Map<FieldName, FieldResult>();
  let totalCost = 0;

  for (const provider of order) {
    const need = fields.filter((f) => !resolved.has(f) && provider.fields.includes(f));
    if (need.length === 0) continue;
    if (!provider.isAvailable(ctx)) continue;

    let out: Awaited<ReturnType<Provider['resolve']>>;
    try {
      out = await provider.resolve(input, need, ctx);
    } catch (e) {
      console.warn(`[waterfall] provider "${provider.name}" failed:`, e);
      continue;
    }

    let providerHit = false;
    for (const field of need) {
      const hit = out[field];
      if (!hit || hit.value == null || hit.value === '') continue;
      resolved.set(field, {
        field,
        value: hit.value,
        confidence: hit.confidence,
        resolvedBy: provider.name,
        source: hit.source,
        cost: 0, // per-field cost is attributed once per provider hit below
      });
      providerHit = true;
    }
    // charge-on-hit: cost is per provider invocation that produced ≥1 field
    if (providerHit && provider.cost > 0) totalCost += provider.cost;
  }

  const results = Array.from(resolved.values());
  const unresolved = fields.filter((f) => !resolved.has(f));

  if (ctx.contactId) await persist(ctx.contactId, results);

  return { results, totalCost, unresolved };
}

/** Upsert resolved fields into enrichment_fields with freshness metadata. */
async function persist(contactId: string, results: FieldResult[]): Promise<void> {
  if (results.length === 0) return;
  const db = supabaseAdmin();
  const now = new Date();
  const in90d = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // default 90-day freshness
  const rows = results.map((r) => ({
    contact_id: contactId,
    field: r.field,
    value: r.value,
    confidence: r.confidence,
    resolved_by: r.resolvedBy,
    source: r.source ?? null,
    cost: r.cost,
    verified_at: now.toISOString(),
    expires_at: in90d.toISOString(),
    is_stale: false,
  }));
  const { error } = await db.from('enrichment_fields').upsert(rows, { onConflict: 'contact_id,field' });
  if (error) console.warn('[waterfall] persist failed:', error.message);
}
