// HELIX SDR-BDR-BOT — Supabase clients
// Own DB for accounts/contacts/enrichment_fields. Also the bridge to Product 02 (Dashboards).
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Browser/client-safe client (respects RLS). */
export const supabase = createClient(url, anonKey);

/** Server-only client (service role — bypasses RLS). Never import into client components. */
export function supabaseAdmin() {
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
