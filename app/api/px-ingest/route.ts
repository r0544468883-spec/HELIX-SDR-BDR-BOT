import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applyEvent, tierFor } from '@/lib/pixel/score';

export const dynamic = 'force-dynamic';

// HELIX PIXEL ingestion — self-contained, no CRM dependency.
// Stores one behavior event from helix.js, updates the visitor's live intent
// score, and records identity (email) on the visitor when marketing consent is
// present. First-party, workspace-scoped, server-side (service_role).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

export function OPTIONS() {
  return new Response('ok', { headers: cors });
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

type Payload = {
  event?: string;
  ts?: string;
  workspace_id?: string;
  visitor_id?: string;
  session_id?: string;
  contact_hint?: string | null;
  url?: string;
  referrer?: string | null;
  props?: Record<string, unknown>;
  consent?: { analytics?: boolean; marketing?: boolean };
  device?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Payload;
  if (!b.workspace_id || !b.visitor_id || !b.event) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: cors });
  }

  const db = admin();
  if (!db) return NextResponse.json({ error: 'no_backend' }, { status: 200, headers: cors });

  const ws = b.workspace_id;
  const vid = b.visitor_id;
  const nowMs = Date.parse(b.ts || '') || Date.now();
  const marketing = !!b.consent?.marketing;

  // 1) store the raw event.
  await db.from('pixel_events').insert({
    workspace_id: ws,
    visitor_id: vid,
    session_id: b.session_id ?? null,
    event: b.event,
    url: b.url ?? null,
    referrer: b.referrer ?? null,
    props: b.props ?? {},
    consent: b.consent ?? {},
    device: b.device ?? {},
    ts: new Date(nowMs).toISOString(),
  });

  if (b.event === 'consent_update') {
    await db.from('pixel_consent').insert({
      workspace_id: ws,
      visitor_id: vid,
      analytics: b.consent?.analytics !== false,
      marketing,
    });
  }

  // 2) load (or seed) the visitor, decay + add score.
  const { data: prior } = await db
    .from('pixel_visitors')
    .select('intent_score, last_seen, contact_email, signals')
    .eq('visitor_id', vid)
    .maybeSingle();

  const priorScore = prior?.intent_score ? Number(prior.intent_score) : 0;
  const lastSeenMs = prior?.last_seen ? Date.parse(prior.last_seen) : nowMs;
  const newScore = applyEvent(priorScore, lastSeenMs, nowMs, b.event);
  const tier = tierFor(newScore);

  const signals = (prior?.signals as Record<string, number>) || {};
  signals[b.event] = (signals[b.event] || 0) + 1;

  // 3) identity (email) with marketing consent. No CRM lookup, self-contained.
  let contactEmail: string | null = (prior?.contact_email as string) || null;
  if (!contactEmail && marketing) {
    const email = b.event === 'identify' ? (b.props?.email as string | undefined) : b.contact_hint || undefined;
    if (email) {
      contactEmail = String(email).toLowerCase();
      await db
        .from('pixel_events')
        .update({ contact_email: contactEmail })
        .eq('workspace_id', ws)
        .eq('visitor_id', vid)
        .is('contact_email', null);
    }
  }

  await db.from('pixel_visitors').upsert(
    {
      visitor_id: vid,
      workspace_id: ws,
      contact_email: contactEmail,
      last_seen: new Date(nowMs).toISOString(),
      intent_score: newScore,
      intent_tier: tier,
      signals,
      consent: b.consent ?? {},
      ...(prior ? {} : { first_seen: new Date(nowMs).toISOString() }),
    },
    { onConflict: 'visitor_id' }
  );

  return NextResponse.json({ ok: true, tier }, { headers: cors });
}
