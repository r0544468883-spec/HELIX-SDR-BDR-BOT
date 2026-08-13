// Department Chief for SDR enrichment (charter §4b). After the Researcher agents
// extract fields, this runs the adversarial Verifier over each one and downgrades
// the confidence of claims the cited sources don't actually support — so
// confident-but-wrong data gets filtered by the existing confidence thresholds
// instead of flowing into the CRM / outreach as fact.
//
// Best-effort and NON-blocking: a field with no sources is left untouched, and an
// unreachable Verifier leaves everything unchanged (never fabricates, never drops
// a legitimately-sourced value). Value is never invented — only confidence moves.
import type { EnrichmentResult } from '@/lib/types';
import { verifyField } from './roles/verifier';
import { critiqueOutreach } from './roles/outreach-critic';
import type { OutreachReview } from './contract';

export async function verifyEnrichments(
  results: Record<string, EnrichmentResult>,
): Promise<Record<string, EnrichmentResult>> {
  const entries = Object.entries(results).filter(
    ([, r]) => r && r.value != null && (r.sourceContext?.length ?? 0) > 0,
  );
  if (entries.length === 0) return results;

  const verifications = await Promise.all(
    entries.map(([name, r]) => verifyField(name, r.value, r.sourceContext ?? [], r.confidence)),
  );

  const out: Record<string, EnrichmentResult> = { ...results };
  entries.forEach(([name, r], i) => {
    const v = verifications[i];
    if (!v) return; // verifier unavailable → unchanged
    if (v.supported === 'no') {
      // Sources don't back the claim — collapse confidence so thresholds drop it.
      out[name] = { ...r, confidence: Math.min(r.confidence, 0.2) };
    } else if (v.supported === 'partial') {
      out[name] = { ...r, confidence: Math.min(r.confidence, Math.max(0.4, v.adjustedConfidence)) };
    }
    // 'yes' → keep the extractor's confidence as-is.
  });
  return out;
}

// Conservative default: an unreachable outreach Critic holds the send for human
// approval — never auto-sends in the user's name un-reviewed.
const HELD_OUTREACH: OutreachReview = {
  verdict: 'revise',
  safeToSend: false,
  risks: ['המבקר לא זמין'],
  note: 'המבקר לא זמין — לא שולח אוטומטית, ממתין לאישור אדם.',
};

// Review a drafted outbound message before the autonomy switch may auto-send it.
export async function reviewOutreach(message: string, channel: string): Promise<OutreachReview> {
  if (!message.trim()) {
    return { verdict: 'block', safeToSend: false, risks: ['הודעה ריקה'], note: 'הודעה ריקה — אין מה לשלוח.' };
  }
  const review = await critiqueOutreach(message, channel).catch(() => null);
  return review ?? HELD_OUTREACH;
}
