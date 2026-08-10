// HELIX Autonomy Switch — mode resolution. Fail-safe & downgrade-only.

import type { AutonomyMode } from './types';
import { needsRiskAck } from './types';

export interface AutonomyStore {
  getSettings(
    workspaceId: string,
    featureKey: string,
  ): Promise<{ mode: AutonomyMode; risk_ack: boolean } | null>;
}

export async function resolveMode(
  store: AutonomyStore,
  workspaceId: string,
  featureKey: string,
): Promise<AutonomyMode> {
  let row: { mode: AutonomyMode; risk_ack: boolean } | null = null;
  try {
    row = await store.getSettings(workspaceId, featureKey);
  } catch {
    return 'advisor';
  }
  if (!row) return 'advisor';
  if (row.mode === 'autopilot' && needsRiskAck(featureKey) && !row.risk_ack) {
    return 'approve';
  }
  return row.mode;
}

// Legacy adapter: SDR's trust ladder. Kept for reference / inbound reuse.
// NOTE: for cold outreach we do NOT auto-derive autopilot from trust — cold
// outbound autopilot must be an explicit per-feature opt-in with risk_ack.
export function fromSdrTrust(trust: 'founder' | 'growth' | 'pro'): AutonomyMode {
  return trust === 'pro' ? 'autopilot' : 'approve';
}
