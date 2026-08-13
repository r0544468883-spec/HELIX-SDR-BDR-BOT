// HELIX SDR-BDR-BOT — internal agent department (charter §4b of
// HELIX-CHIEF-AND-AGENTS-SPEC). The fork already ships enrichment "Researcher"
// agents (discovery/profile/metrics/funding/tech-stack) coordinated by the
// orchestrator. What was missing is the adversarial member: a Critic that
// VERIFIES each enriched field against its cited source before the fact is
// trusted — the #1 enrichment failure is confident-but-wrong data flowing into
// the CRM/outreach. This is the same pattern as Rank/Growth-Doctor/OPS.

export type Supported = 'yes' | 'partial' | 'no';

export type FieldVerification = {
  field: string;
  supported: Supported;        // do the cited snippets actually back the value?
  adjustedConfidence: number;  // 0..1 — the Critic's confidence, not the extractor's
  note: string;                // one short sentence
};
