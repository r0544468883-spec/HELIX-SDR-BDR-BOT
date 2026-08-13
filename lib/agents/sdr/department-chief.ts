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
import { strategize } from './roles/strategist';
import { revise } from './roles/reviser';
import { draftOutreach, type Draft, type DraftInput } from '@/lib/agent/message';
import type { OutreachReview } from './contract';

// Re-exported so callers wire the whole department from one module.
export { scoreIcp, type IcpScore } from './roles/icp-scorer';
export { selectChannel, type Channel, type ChannelChoice } from './roles/channel-selector';

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

const composeText = (d: { subject?: string; body: string }): string =>
  d.subject ? `נושא: ${d.subject}\n\n${d.body}` : d.body;

// The drafting department: Strategist (pick the angle) → Writer (draft) → Critic
// (find what's wrong) → Editor (revise once to fix it + sound human). Returns the
// improved draft plus the final send-review, so the route enqueues better copy and
// the autonomy gate has a verdict in hand. Best-effort: any agent failing falls
// back to the previous step's output (never worse than today's single-shot draft).
// Shared Critic→Editor loop: critique the draft; if fixable or too AI-sounding,
// the Editor revises once (fix feedback + humanize), then re-review. Used by both
// first-touch and follow-up so the whole team runs on every outbound message.
async function refineAndReview(
  initial: Draft,
  channel: string,
  language: 'he' | 'en',
): Promise<Draft & { review: OutreachReview }> {
  let draft = initial;
  let review = await critiqueOutreach(composeText(draft), channel).catch(() => null);
  const needsRevise = review?.verdict === 'revise' || draft.aiScore > 60;
  if (needsRevise) {
    const feedback = [...(review?.risks ?? []), draft.aiScore > 60 ? 'נשמע מלאכותי מדי — הפוך לאנושי וטבעי' : ''];
    const revised = await revise({ subject: draft.subject, body: draft.body }, feedback, language, channel).catch(() => null);
    if (revised) {
      draft = { ...draft, subject: revised.subject, body: revised.body };
      review = await critiqueOutreach(composeText(draft), channel).catch(() => review);
    }
  }
  return { ...draft, review: review ?? HELD_OUTREACH };
}

function factsOf(input: DraftInput): string {
  return [
    input.fullName && `שם: ${input.fullName}`,
    input.title && `תפקיד: ${input.title}`,
    input.company && `חברה: ${input.company}`,
    input.industry && `תעשייה: ${input.industry}`,
    input.techStack && `טכנולוגיה: ${input.techStack}`,
  ].filter(Boolean).join('\n');
}

export async function composeOutreach(input: DraftInput): Promise<Draft & { review: OutreachReview }> {
  const language = input.language ?? 'he';
  const channel = input.channel ?? 'email';

  // 1) Strategist — choose the strongest angle + the one hook worth using.
  const strategy = await strategize({ facts: factsOf(input), hooks: input.hooks, offer: input.offer, channel, language }).catch(() => null);

  // 2) Writer — draft, guided by the brief and the single chosen hook.
  const draft = await draftOutreach({
    ...input,
    brief: strategy?.brief,
    hooks: strategy?.chosenHook ? [strategy.chosenHook] : input.hooks,
  });

  // 3) Critic → 4) Editor.
  return refineAndReview(draft, channel, language);
}

// Follow-up composer: given the prior message and what happened since, write the
// next touch — value-adding, not a nagging "just checking in" — through the same
// Writer → Critic → Editor team.
export async function composeFollowup(
  input: DraftInput & { priorMessage: string; outcome: string },
): Promise<Draft & { review: OutreachReview }> {
  const language = input.language ?? 'he';
  const channel = input.channel ?? 'email';
  const brief = `זו פנייה חוזרת (follow-up), לא פנייה ראשונה.
ההודעה הקודמת ששלחנו:
"""${(input.priorMessage || '').slice(0, 600)}"""
מה שקרה מאז: ${input.outcome}.
כתוב follow-up קצר ולא-נודניק שמוסיף ערך או זווית חדשה (תובנה, נתון, שאלה ממוקדת) — לא "רק מוודא שקיבלת". אם אין מה להוסיף, קצר עדיף.`;
  const draft = await draftOutreach({ ...input, brief });
  return refineAndReview(draft, channel, language);
}
