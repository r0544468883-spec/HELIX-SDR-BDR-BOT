// HELIX SDR-BDR-BOT — Conversation Memory (RAG). Spec §3.3.6.
// recallSimilar: find how the user answered similar questions before → ground new replies.
// rememberExchange: store a (question → answer) pair, embedded, for future recall.
// Both no-op gracefully when embeddings are unavailable (no Ollama) so the app still runs.
import { supabaseAdmin } from './supabase';
import { embed } from './embeddings';

export interface MemoryExample {
  id: string;
  question: string;
  answer: string;
  similarity: number;
}

/** Recall the K most similar past exchanges for this workspace. Empty if RAG disabled. */
export async function recallSimilar(workspaceId: string, text: string, k = 3): Promise<MemoryExample[]> {
  const vec = await embed(text);
  if (!vec) return [];
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('match_conversation_memory', {
    p_workspace: workspaceId,
    p_query: vec,
    p_k: k,
  });
  if (error || !data) return [];
  return data as MemoryExample[];
}

/** Store an inbound→reply exchange so future replies can learn from it. */
export async function rememberExchange(
  workspaceId: string,
  question: string,
  answer: string,
  sourceThreadId?: string,
): Promise<void> {
  if (!question || !answer) return;
  const vec = await embed(question);
  const db = supabaseAdmin();
  await db.from('conversation_memory').insert({
    workspace_id: workspaceId,
    question: question.slice(0, 4000),
    answer: answer.slice(0, 4000),
    embedding: vec, // null when RAG disabled — row still stored, just not searchable
    source_thread_id: sourceThreadId ?? null,
  });
}
