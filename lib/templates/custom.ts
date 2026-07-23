// Custom (user-uploaded) templates — the workspace defines its OWN templates for
// any message type, merged over the built-in catalogs (a custom key OVERRIDES a
// built-in one). Backed by the custom_templates table.
import { supabaseAdmin } from '@/lib/helix/supabase';
import { TEMPLATES, type TemplateDef } from './catalog';
import { EMAIL_TEMPLATES, type EmailTemplate } from './email-catalog';

export type CustomKind = 'whatsapp' | 'email';

async function rows(workspaceId: string, kind: CustomKind): Promise<{ key: string; definition: unknown }[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('custom_templates')
    .select('key, definition').eq('workspace_id', workspaceId).eq('kind', kind).eq('active', true);
  return (data ?? []) as { key: string; definition: unknown }[];
}

/** Built-in WhatsApp templates ∪ workspace customs (customs override by key). */
export async function mergedWhatsAppTemplates(workspaceId: string): Promise<Record<string, TemplateDef>> {
  const merged: Record<string, TemplateDef> = { ...TEMPLATES };
  for (const r of await rows(workspaceId, 'whatsapp')) merged[r.key] = r.definition as TemplateDef;
  return merged;
}

/** Built-in email templates ∪ workspace customs (customs override by key). */
export async function mergedEmailTemplates(workspaceId: string): Promise<Record<string, EmailTemplate>> {
  const merged: Record<string, EmailTemplate> = {};
  for (const t of EMAIL_TEMPLATES) merged[t.key] = t;
  for (const r of await rows(workspaceId, 'email')) merged[r.key] = r.definition as EmailTemplate;
  return merged;
}

export async function listCustom(workspaceId: string, kind?: CustomKind) {
  const db = supabaseAdmin();
  let q = db.from('custom_templates').select('kind, key, definition, active').eq('workspace_id', workspaceId);
  if (kind) q = q.eq('kind', kind);
  const { data } = await q;
  return data ?? [];
}

export async function upsertCustom(workspaceId: string, kind: CustomKind, key: string, definition: unknown): Promise<{ ok: boolean; error?: string }> {
  const err = validate(kind, definition);
  if (err) return { ok: false, error: err };
  const db = supabaseAdmin();
  const { error } = await db.from('custom_templates').upsert(
    { workspace_id: workspaceId, kind, key, definition, active: true, updated_at: new Date().toISOString() },
    { onConflict: 'workspace_id,kind,key' },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteCustom(workspaceId: string, kind: CustomKind, key: string): Promise<void> {
  const db = supabaseAdmin();
  await db.from('custom_templates').delete().eq('workspace_id', workspaceId).eq('kind', kind).eq('key', key);
}

/** Minimal shape validation so a bad upload can't break the runner/senders. */
function validate(kind: CustomKind, def: unknown): string | null {
  if (!def || typeof def !== 'object') return 'definition must be an object';
  const d = def as Record<string, unknown>;
  if (kind === 'whatsapp') {
    if (typeof d.name !== 'string' || !/^[a-z0-9_]+$/.test(d.name)) return 'whatsapp: name required (a-z0-9_)';
    if (typeof d.language !== 'string') return 'whatsapp: language required';
    if (!['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(d.category as string)) return 'whatsapp: category must be UTILITY|MARKETING|AUTHENTICATION';
    if (typeof d.body !== 'string') return 'whatsapp: body required';
    if (!Array.isArray(d.params)) return 'whatsapp: params must be an array';
    if (!Array.isArray(d.sampleParams)) return 'whatsapp: sampleParams must be an array';
  } else if (kind === 'email') {
    if (typeof d.subject !== 'string') return 'email: subject required';
    if (typeof d.body !== 'string') return 'email: body required';
  }
  return null;
}
