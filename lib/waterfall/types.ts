// HELIX SDR-BDR-BOT — Waterfall enrichment types (own-first, vendor-fallback).
// Spec §4: layer-1 = our own sources (cost 0), layer-2 = optional vendors (BYO-key, charge-on-hit).

/** Everything we know about a target before enrichment. */
export interface WaterfallInput {
  domain?: string;
  companyName?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
}

/** Fields the waterfall can resolve. Extend as providers grow. */
export type FieldName =
  | 'company_name'
  | 'description'
  | 'industry'
  | 'tech_stack'
  | 'logo_url'
  | 'lead_status'
  | 'work_email'
  | 'mobile';

/** A single resolved field, with full provenance for GDPR + cost transparency. */
export interface FieldResult {
  field: FieldName;
  value: string | null;
  confidence: number;      // 0..1
  resolvedBy: string;      // provider name → enrichment_fields.resolved_by
  source?: string;         // URL / provider, for source transparency
  cost: number;            // charge-on-hit; 0 for own layer
}

/** Per-provider context (keys, BYO config, the workspace's Supabase row). */
export interface ProviderContext {
  firecrawlApiKey?: string;
  /** BYO-key: customer's own vendor keys (Apollo/Lusha/Hunter). Layer-2 only. */
  byoKeys?: Record<string, string>;
  /** Existing contact row id — enables the cache provider to read prior fresh values. */
  contactId?: string;
}

/**
 * A provider resolves a subset of fields for one target.
 * It returns only the fields it could resolve (verified) — the orchestrator
 * handles ordering, stop-on-hit, dedup and persistence.
 */
export interface Provider {
  name: string;                 // → resolved_by
  layer: 1 | 2;                 // 1 = own (cost 0), 2 = vendor (charge-on-hit)
  cost: number;                 // per-hit cost for this provider
  fields: FieldName[];          // fields this provider can produce
  /** BYO/layer-2 providers return false when their key is missing → skipped, not errored. */
  isAvailable(ctx: ProviderContext): boolean;
  resolve(
    input: WaterfallInput,
    need: FieldName[],
    ctx: ProviderContext,
  ): Promise<Partial<Record<FieldName, Omit<FieldResult, 'field' | 'resolvedBy' | 'cost'>>>>;
}
