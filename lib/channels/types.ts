// HELIX SDR-BDR-BOT — channel send primitives (ported from helix-ops distribution).
export type ChannelConfig = Record<string, unknown>;
export type SendResult = { ok: boolean; externalId?: string; error?: string };

/** An approve/reject action pair rendered as channel-native buttons. */
export interface ApprovalButtons {
  approveLabel: string;
  rejectLabel: string;
  /** Opaque payload echoed back on button press — we encode the approval_queue id. */
  approveData: string;
  rejectData: string;
}
