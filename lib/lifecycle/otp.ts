// OTP (one-time passcode) — customer verification over WhatsApp using the
// AUTHENTICATION template `sdr_otp`. Falls back to a plain text send in-window if
// the auth template isn't approved yet. Code is stored hashed-free (short-lived,
// single-use, attempt-capped) in otp_codes.
import { supabaseAdmin } from '@/lib/helix/supabase';
import { sendWhatsAppTemplate, sendWhatsApp } from '@/lib/channels/whatsapp';
import { TEMPLATES } from '@/lib/templates/catalog';
import type { ChannelConfig } from '@/lib/channels/types';

const EXPIRY_MIN = TEMPLATES.otp.auth?.codeExpiryMinutes ?? 5;
const MAX_ATTEMPTS = 5;

function sixDigits(): string {
  // 6-digit numeric, non-crypto (fine for short-lived OTP); avoid leading-zero loss.
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function waConfig(workspaceId: string): Promise<ChannelConfig> {
  const db = supabaseAdmin();
  const { data } = await db.from('channel_bindings').select('config').eq('workspace_id', workspaceId).eq('channel', 'whatsapp').maybeSingle();
  return (data?.config ?? {}) as ChannelConfig;
}

export async function sendOtp(workspaceId: string, phone: string): Promise<{ ok: boolean; error?: string }> {
  const db = supabaseAdmin();
  const code = sixDigits();
  const expiresAt = new Date(Date.now() + EXPIRY_MIN * 60_000).toISOString();
  // Invalidate previous unconsumed codes for this phone, then store the new one.
  await db.from('otp_codes').update({ consumed: true }).eq('workspace_id', workspaceId).eq('phone', phone).eq('consumed', false);
  await db.from('otp_codes').insert({ workspace_id: workspaceId, phone, code, expires_at: expiresAt });

  const config = await waConfig(workspaceId);
  const def = TEMPLATES.otp;
  let res = await sendWhatsAppTemplate(config, phone, def.name, def.language, [code, String(EXPIRY_MIN)]);
  if (!res.ok && /template|not found|does not exist|132001|param/i.test(res.error ?? '')) {
    res = await sendWhatsApp(config, phone, `${code} הוא קוד האימות שלך. תקף ל-${EXPIRY_MIN} דקות ואין לשתף אותו.`);
  }
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function verifyOtp(workspaceId: string, phone: string, code: string): Promise<{ ok: boolean; reason?: string }> {
  const db = supabaseAdmin();
  const { data: row } = await db.from('otp_codes')
    .select('id, code, expires_at, attempts')
    .eq('workspace_id', workspaceId).eq('phone', phone).eq('consumed', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!row) return { ok: false, reason: 'no_code' };
  if (new Date(row.expires_at as string).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if ((row.attempts as number) >= MAX_ATTEMPTS) {
    await db.from('otp_codes').update({ consumed: true }).eq('id', row.id);
    return { ok: false, reason: 'too_many_attempts' };
  }
  if (String(row.code) !== String(code).trim()) {
    await db.from('otp_codes').update({ attempts: (row.attempts as number) + 1 }).eq('id', row.id);
    return { ok: false, reason: 'mismatch' };
  }
  await db.from('otp_codes').update({ consumed: true }).eq('id', row.id);
  return { ok: true };
}
