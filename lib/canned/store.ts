// Canned replies — DB access + matching over (defaults ∪ workspace customs).
import { supabaseAdmin } from '@/lib/helix/supabase';
import { DEFAULT_CANNED, matchCanned as matchCatalog, mergeCanned, type CannedReply } from './catalog';

async function customs(workspaceId: string): Promise<CannedReply[]> {
  const db = supabaseAdmin();
  const { data } = await db.from('canned_replies')
    .select('key, title, body, triggers').eq('workspace_id', workspaceId).eq('active', true);
  return (data ?? []).map((r) => ({
    key: r.key as string, title: (r.title as string) ?? (r.key as string),
    body: r.body as string, triggers: (r.triggers as string[]) ?? [],
  }));
}

/** Match an inbound message for this workspace (customs override defaults). */
export async function matchCannedForWorkspace(workspaceId: string, text: string): Promise<CannedReply | null> {
  return matchCatalog(text, await customs(workspaceId));
}

/** Full merged list for this workspace (for the bot to display). */
export async function listCanned(workspaceId: string): Promise<CannedReply[]> {
  return mergeCanned(await customs(workspaceId));
}

/** Add/override a canned reply. Triggers default to [title, key] if none given. */
export async function upsertCanned(workspaceId: string, key: string, body: string, title?: string, triggers?: string[]): Promise<void> {
  const db = supabaseAdmin();
  await db.from('canned_replies').upsert(
    { workspace_id: workspaceId, key, body, title: title ?? key, triggers: triggers ?? [title ?? key, key], active: true },
    { onConflict: 'workspace_id,key' },
  );
}

export { DEFAULT_CANNED };
