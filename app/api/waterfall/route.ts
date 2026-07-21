// POST /api/waterfall — run own-first enrichment for one target.
// Body: { input: WaterfallInput, fields: FieldName[], contactId?: string, byoKeys?: {...} }
import { NextRequest, NextResponse } from 'next/server';
import { runWaterfall } from '@/lib/waterfall/orchestrator';
import type { FieldName, WaterfallInput } from '@/lib/waterfall/types';

export const runtime = 'nodejs'; // needs node:dns for MX verification

const ALL_FIELDS: FieldName[] = [
  'company_name', 'description', 'industry', 'tech_stack',
  'logo_url', 'lead_status', 'work_email', 'mobile',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input: WaterfallInput = body.input ?? {};
    const fields: FieldName[] = Array.isArray(body.fields) && body.fields.length ? body.fields : ALL_FIELDS;

    if (!input.domain && !input.companyName) {
      return NextResponse.json({ error: 'input.domain or input.companyName is required' }, { status: 400 });
    }

    const result = await runWaterfall(input, fields, {
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
      byoKeys: body.byoKeys ?? {},
      contactId: body.contactId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[api/waterfall] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Waterfall failed' },
      { status: 500 },
    );
  }
}
