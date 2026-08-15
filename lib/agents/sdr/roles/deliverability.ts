// Deliverability role (collected from the 11x/Reply.io playbook: "warmup /
// deliverability" as a distinct job). Deterministic pre-send check that the cold
// message won't trip spam filters — spammy words, ALL-CAPS, too many links / !!!,
// or a wrong length. Pure logic, no model call. Feeds the send gate: a high-risk
// message is held for a human instead of burning the sender's domain reputation.

const SPAM_WORDS = [
  'חינם', 'מבצע', 'הנחה ענקית', 'לחץ כאן', 'הזדמנות אחרונה', 'מוגבל בזמן', 'זכית',
  'free', 'click here', 'act now', 'limited time', 'guarantee', 'winner', 'cash',
  'buy now', 'risk-free', '100%', 'urgent', 'congratulations',
];

export interface DeliverabilityCheck {
  risk: 'low' | 'high';
  reasons: string[];
}

export function checkDeliverability(message: { subject?: string; body: string }): DeliverabilityCheck {
  const text = `${message.subject ?? ''}\n${message.body}`;
  const lower = text.toLowerCase();
  const reasons: string[] = [];

  const spamHits = SPAM_WORDS.filter((w) => lower.includes(w.toLowerCase()));
  if (spamHits.length >= 2) reasons.push(`מילות-ספאם: ${spamHits.slice(0, 4).join(', ')}`);

  const links = (text.match(/https?:\/\//g) ?? []).length;
  if (links >= 3) reasons.push(`יותר מדי קישורים (${links})`);

  const bangs = (text.match(/!/g) ?? []).length;
  if (bangs >= 3) reasons.push('יותר מדי סימני-קריאה');

  // ALL-CAPS words (Latin) — a classic spam signal.
  const capsWords = (text.match(/\b[A-Z]{4,}\b/g) ?? []).length;
  if (capsWords >= 2) reasons.push('מילים ב-CAPS');

  const bodyLen = message.body.trim().length;
  if (bodyLen < 40) reasons.push('קצר מדי (נראה כמו ספאם)');
  if (bodyLen > 1500) reasons.push('ארוך מדי לפנייה קרה');

  return { risk: reasons.length >= 2 ? 'high' : 'low', reasons };
}
