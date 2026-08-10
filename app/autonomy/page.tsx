import { supabaseAdmin } from '@/lib/helix/supabase';
import AutonomySwitch from '@/components/AutonomySwitch';
import type { AutonomyMode } from '@/lib/autonomy/types';

export const dynamic = 'force-dynamic';

const FEATURES: { key: string; label: string; risky: boolean }[] = [
  { key: 'sdr.outreach', label: '✉️ פנייה קרה ללידים', risky: true },
  { key: 'sdr.inbound_reply', label: '💬 מענה אוטומטי לתגובות', risky: true },
  { key: 'sdr.lifecycle', label: '🔁 תזכורות מחזור-חיים', risky: true },
  { key: 'sdr.enrich_trigger', label: '🔍 העשרה יזומה', risky: false },
];

export default async function AutonomyPage() {
  const settings: Record<string, { mode: AutonomyMode; risk_ack: boolean }> = {};
  try {
    const db = supabaseAdmin();
    const { data: ws } = await db.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (ws?.id) {
      const { data: rows } = await db.from('autonomy_settings').select('feature_key, mode, risk_ack').eq('workspace_id', ws.id);
      for (const r of (rows ?? []) as { feature_key: string; mode: AutonomyMode; risk_ack: boolean }[]) settings[r.feature_key] = { mode: r.mode, risk_ack: r.risk_ack };
    }
  } catch { /* not configured yet — render defaults */ }

  return (
    <main dir="rtl" style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(20px,4vw,48px)', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 800, margin: '0 0 6px' }}>⚙️ מתג אוטונומיה</h1>
      <p style={{ color: 'var(--ink-2, #6b7280)', fontSize: 14, margin: '0 0 20px' }}>כמה חופש לתת ל-SDR לפעול לבד. ברירת מחדל בטוחה: המלצה בלבד. פנייה קרה אף פעם לא נשלחת לבד בלי אישור מפורש.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        {FEATURES.map((f) => (
          <AutonomySwitch key={f.key} featureKey={f.key} label={f.label} risky={f.risky}
            initialMode={settings[f.key]?.mode ?? 'advisor'} initialRiskAck={settings[f.key]?.risk_ack ?? false} />
        ))}
      </div>
    </main>
  );
}
