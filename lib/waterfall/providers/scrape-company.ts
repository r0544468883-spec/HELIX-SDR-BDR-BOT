// Layer-1 provider — company scrape + Claude extraction.
// Ported from PLUG edge function `scrape-company` (Firecrawl + Claude), adapted to
// this app's FirecrawlService + central Claude client. Own source → cost 0.
import { FirecrawlService } from '@/lib/services/firecrawl';
import { createLLM, CLAUDE_MODEL_FAST } from '@/lib/helix/llm';
import type { Provider, WaterfallInput, FieldName, ProviderContext } from '../types';

type Extracted = {
  name?: string;
  description?: string;
  industry?: string;
  tech_stack?: string[];
  lead_status?: string;
  logo_url?: string | null;
};

const FIELD_MAP: Record<string, FieldName> = {
  name: 'company_name',
  description: 'description',
  industry: 'industry',
  tech_stack: 'tech_stack',
  lead_status: 'lead_status',
  logo_url: 'logo_url',
};

export const scrapeCompanyProvider: Provider = {
  name: 'scrape',
  layer: 1,
  cost: 0,
  fields: ['company_name', 'description', 'industry', 'tech_stack', 'lead_status', 'logo_url'],

  isAvailable(ctx: ProviderContext) {
    return Boolean(ctx.firecrawlApiKey);
  },

  async resolve(input: WaterfallInput, need: FieldName[], ctx: ProviderContext) {
    if (!input.domain || !ctx.firecrawlApiKey) return {};

    // 1) Scrape → markdown (Firecrawl, with the service's built-in retry/fetch fallback).
    let content = '';
    let sourceUrl = input.domain.startsWith('http') ? input.domain : `https://${input.domain}`;
    try {
      const firecrawl = new FirecrawlService(ctx.firecrawlApiKey);
      const res = await firecrawl.scrapeUrl(sourceUrl);
      content = (res.data?.markdown || res.data?.html || '').substring(0, 20000);
    } catch (e) {
      console.warn('[waterfall/scrape] scrape failed:', e);
      return {};
    }
    if (!content) return {};

    // 2) Extract structured company info via Claude (fast tier — high-volume, low-stakes).
    const llm = createLLM();
    let extracted: Extracted = {};
    try {
      const completion = await llm.chat.completions.create({
        model: CLAUDE_MODEL_FAST,
        messages: [
          {
            role: 'system',
            content:
              'You are a data extraction assistant. Respond with valid JSON only — no markdown, no code fences, no explanation.',
          },
          {
            role: 'user',
            content: `Extract company information from the webpage content and return a JSON object with these exact fields:
- name: company name (string)
- description: 2-3 sentence company description (string)
- industry: industry/sector (string)
- tech_stack: technologies mentioned (array of strings)
- lead_status: "active" if actively hiring, "lead" if general info, "cold" if outdated (string)
- logo_url: logo image URL if found (string or null)

Return ONLY the JSON object.

Webpage URL: ${sourceUrl}
Webpage content:
${content}`,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 800,
      });
      const raw = completion.choices[0]?.message?.content || '';
      try {
        extracted = JSON.parse(raw);
      } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) extracted = JSON.parse(m[0]);
      }
    } catch (e) {
      console.warn('[waterfall/scrape] extraction failed:', e);
      return {};
    }

    // 3) Map to waterfall fields; only return fields that were needed and present.
    const out: Partial<Record<FieldName, { value: string | null; confidence: number; source?: string }>> = {};
    for (const [srcKey, field] of Object.entries(FIELD_MAP)) {
      if (!need.includes(field)) continue;
      const v = (extracted as Record<string, unknown>)[srcKey];
      if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === '') continue;
      out[field] = {
        value: Array.isArray(v) ? v.join(', ') : String(v),
        confidence: 0.7, // scraped+LLM-extracted → medium-high
        source: sourceUrl,
      };
    }
    return out;
  },
};
