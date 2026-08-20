// HELIX PIXEL — intent scoring. Real-time, decayed.
// Spec §7.3: score = min(100, Σ weight_i · e^(−λ·Δt_i)), half-life 48h.
// We approximate incrementally: decay the stored score to "now", then add the
// new event's weight. Equivalent to the sum-of-decayed-weights when applied per
// event, and cheap enough to run on every ingest.

export const HALF_LIFE_HOURS = 48;
const LAMBDA = Math.LN2 / HALF_LIFE_HOURS; // per hour

// Per-event weights. Buying-intent events dominate; ambient events are light.
export const WEIGHTS: Record<string, number> = {
  pricing_view: 3,
  repeat_pricing_visit: 5,
  demo_click: 8,
  video_progress: 4,
  return_visit: 2,
  cart_abandon: 6,
  form_abandon: 4,
  form_submit: 10,
  form_start: 1,
  high_intent_scroll: 3,
  add_to_cart: 5,
  checkout_start: 6,
  purchase: 12,
  exit_intent: 1,
  // ambient / zero-weight (still stored, just no score push)
  pageview: 0,
  click: 0,
  scroll_depth: 0,
  time_on_page: 0,
};

export type Tier = 'cold' | 'warm' | 'hot';

export function tierFor(score: number): Tier {
  if (score >= 70) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}

/** Decay a stored score from `lastSeen` to `now` (both ms epoch). */
export function decay(score: number, lastSeenMs: number, nowMs: number): number {
  const hours = Math.max(0, (nowMs - lastSeenMs) / 3_600_000);
  return score * Math.exp(-LAMBDA * hours);
}

/** Apply one event to a prior score. Returns the new capped score. */
export function applyEvent(
  priorScore: number,
  lastSeenMs: number,
  nowMs: number,
  event: string
): number {
  const decayed = decay(priorScore, lastSeenMs, nowMs);
  const w = WEIGHTS[event] ?? 0;
  return Math.min(100, +(decayed + w).toFixed(2));
}
