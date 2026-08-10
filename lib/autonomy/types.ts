// HELIX Autonomy Switch — canonical types. Source: helix/PRODUCTS/autonomy-reference.

export type AutonomyMode = 'advisor' | 'approve' | 'autopilot';
export type RiskClass = 'internal' | 'outbound' | 'money' | 'tos';

export type Disposition = 'display' | 'enqueue' | 'execute';

export interface ProposedAction<T = unknown> {
  featureKey: string;
  summary: string;
  payload: T;
}

export const RISK_BY_FEATURE: Record<string, RiskClass> = {
  'sdr.outreach': 'outbound',
  'sdr.inbound_reply': 'outbound',
  'sdr.lifecycle': 'outbound',
  'sdr.enrich_trigger': 'internal',
};

export function riskOf(featureKey: string): RiskClass {
  return RISK_BY_FEATURE[featureKey] ?? 'outbound';
}

export function needsRiskAck(featureKey: string): boolean {
  return riskOf(featureKey) !== 'internal';
}
