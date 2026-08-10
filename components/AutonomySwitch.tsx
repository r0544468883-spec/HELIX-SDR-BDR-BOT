'use client';

import { useState } from 'react';
import { setAutonomyMode } from '@/app/actions-autonomy';

// Portable 3-mode switch (advisor → approve → autopilot) for one feature.
// The small effect: the active pill SLIDES between segments, pops on change, and
// glows on autopilot. Risky (outbound/tos) features reveal a risk_ack checkbox
// required for autopilot. Colors use CSS-var fallbacks so it works in any product.
type Mode = 'advisor' | 'approve' | 'autopilot';
const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: 'advisor', label: 'המלצה', icon: '💡' },
  { key: 'approve', label: 'אישור', icon: '📩' },
  { key: 'autopilot', label: 'אוטופיילוט', icon: '🤖' },
];
const C = {
  panel: 'var(--panel, #ffffff)', line: 'var(--line, #e5e7eb)', bg: 'var(--bg, #f8fafc)',
  brand: 'var(--brand, #10b981)', brandSoft: 'var(--brand-soft, #ecfdf5)', brandInk: 'var(--brand-ink, #047857)',
  h1: 'var(--h1, #059669)', ink2: 'var(--ink-2, #6b7280)', crit: 'var(--crit, #dc2626)',
};

export default function AutonomySwitch({ featureKey, label, risky, initialMode, initialRiskAck }: {
  featureKey: string; label: string; risky: boolean; initialMode: Mode; initialRiskAck: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [riskAck, setRiskAck] = useState<boolean>(initialRiskAck);
  const [saving, setSaving] = useState(false);
  const [popKey, setPopKey] = useState(0);

  const idx = MODES.findIndex((m) => m.key === mode);
  const downgraded = mode === 'autopilot' && risky && !riskAck;

  async function persist(nextMode: Mode, nextAck: boolean) {
    setSaving(true);
    try { await setAutonomyMode(featureKey, nextMode, nextAck); } finally { setSaving(false); }
  }
  function pick(next: Mode) { if (next === mode) return; setMode(next); setPopKey((k) => k + 1); persist(next, riskAck); }
  function toggleAck() { const next = !riskAck; setRiskAck(next); persist(mode, next); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', border: `1px solid ${C.line}`, borderRadius: 14, background: C.panel }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 11, color: C.ink2, minWidth: 44, textAlign: 'end' }}>{saving ? '…שומר' : '✓'}</span>
      </div>
      <div role="radiogroup" aria-label={label} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: C.bg, border: `1px solid ${C.line}`, borderRadius: 11, padding: 3 }}>
        <span key={popKey} className="au-pill" aria-hidden style={{
          position: 'absolute', top: 3, bottom: 3, width: 'calc((100% - 6px) / 3)',
          insetInlineStart: `calc(${idx} * (100% - 6px) / 3 + 3px)`, borderRadius: 9,
          background: mode === 'autopilot' ? `linear-gradient(135deg,${C.brand},${C.h1})` : C.brandSoft,
          boxShadow: mode === 'autopilot' ? `0 0 0 1px ${C.brand}, 0 4px 16px -4px ${C.brand}` : 'none',
          transition: 'inset-inline-start .28s cubic-bezier(.34,1.56,.64,1), background .2s',
        }} />
        {MODES.map((m) => {
          const active = m.key === mode;
          return (
            <button key={m.key} role="radio" aria-checked={active} onClick={() => pick(m.key)}
              style={{ position: 'relative', zIndex: 1, background: 'transparent', border: 0, cursor: 'pointer', padding: '7px 4px', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 800, color: active ? (m.key === 'autopilot' ? '#fff' : C.brandInk) : C.ink2, transition: 'color .2s' }}>
              <span style={{ fontSize: 13 }}>{m.icon}</span> {m.label}
            </button>
          );
        })}
      </div>
      {risky && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: downgraded ? C.crit : C.ink2, cursor: 'pointer' }}>
          <input type="checkbox" checked={riskAck} onChange={toggleAck} style={{ accentColor: C.brand }} />
          {downgraded ? '⚠️ פעולה יוצאת החוצה — סמנו אישור לאוטופיילוט (כרגע ירד ל״אישור״)' : 'מאשר/ת אוטופיילוט לפעולה שיוצאת ללקוחות'}
        </label>
      )}
      <style>{`.au-pill{animation:auPop .28s cubic-bezier(.34,1.56,.64,1)}
        @keyframes auPop{0%{transform:scaleY(.82) scaleX(.97)}60%{transform:scaleY(1.06) scaleX(1.01)}100%{transform:none}}
        @media (prefers-reduced-motion:reduce){.au-pill{animation:none;transition:none!important}}`}</style>
    </div>
  );
}
