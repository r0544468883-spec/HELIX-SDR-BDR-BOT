// HELIX SDR-BDR-BOT → Product 02 (HELIX Dashboards) connection.
// Standalone product PUSHES metrics to the dashboards super-layer (spec §Ecosystem).
// No-op if HELIX_DASHBOARDS_URL is unset, so the app runs fully standalone.

type Metric = {
  workspace_id: string;
  metric: string;            // e.g. 'contacts_enriched', 'emails_verified', 'reply_rate'
  value: number;
  meta?: Record<string, unknown>;
};

export async function pushMetric(m: Metric): Promise<void> {
  const url = process.env.HELIX_DASHBOARDS_URL;
  const key = process.env.HELIX_DASHBOARDS_KEY;
  if (!url) return; // standalone mode — dashboards not connected yet
  try {
    await fetch(`${url.replace(/\/$/, '')}/api/ingest-metric`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key ?? ''}` },
      body: JSON.stringify({ ...m, source: 'sdr-bdr-bot', at: new Date().toISOString() }),
    });
  } catch (e) {
    console.warn('[helix/dashboards] metric push failed (non-fatal):', e);
  }
}
