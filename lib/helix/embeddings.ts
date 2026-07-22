// Text embeddings via Ollama (local, cheap — the spec's model for high-volume RAG).
// Graceful: if OLLAMA_BASE_URL is unset, returns null and the RAG layer disables itself,
// so replies still work (just not memory-grounded).
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

export async function embed(text: string): Promise<number[] | null> {
  const base = process.env.OLLAMA_BASE_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 4000) }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { embedding?: number[] };
    return Array.isArray(json.embedding) ? json.embedding : null;
  } catch (e) {
    console.warn('[embeddings] ollama embed failed:', e);
    return null;
  }
}
