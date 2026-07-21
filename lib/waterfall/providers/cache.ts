// Layer-1 provider — cache. Reads previously-resolved, still-fresh fields from
// enrichment_fields so we never re-pay (own or vendor) for data we already have. Cost 0.
import { supabaseAdmin } from '@/lib/helix/supabase';
import type { Provider, WaterfallInput, FieldName, ProviderContext } from '../types';

export const cacheProvider: Provider = {
  name: 'cache',
  layer: 1,
  cost: 0,
  // Cache can serve ANY field — declare the full set so the orchestrator always consults it first.
  fields: [
    'company_name', 'description', 'industry', 'tech_stack',
    'logo_url', 'lead_status', 'work_email', 'mobile',
  ],

  isAvailable(ctx: ProviderContext) {
    return Boolean(ctx.contactId);
  },

  async resolve(_input: WaterfallInput, need: FieldName[], ctx: ProviderContext) {
    if (!ctx.contactId) return {};
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('enrichment_fields')
      .select('field, value, confidence, source, expires_at, is_stale')
      .eq('contact_id', ctx.contactId)
      .in('field', need);

    if (error || !data) return {};

    const now = Date.now();
    const out: Partial<Record<FieldName, { value: string | null; confidence: number; source?: string }>> = {};
    for (const row of data) {
      if (row.is_stale) continue;
      if (row.expires_at && new Date(row.expires_at).getTime() < now) continue; // decayed
      out[row.field as FieldName] = {
        value: row.value,
        confidence: Number(row.confidence ?? 0),
        source: row.source ?? 'cache',
      };
    }
    return out;
  },
};
