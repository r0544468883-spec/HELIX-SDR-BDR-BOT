'use client';
// Minimal operator-linking card — connect your WhatsApp number so the bot answers
// YOU with your real workspace data (schedule / import / stats) instead of treating
// you as a lead. Writes bot_links via /api/bot/link; the WhatsApp webhook reads it.
import { useCallback, useEffect, useState } from 'react';

export function BotLinkCard() {
  const [phone, setPhone] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/bot/link');
      const j = await r.json();
      setLinks(j.links ?? []);
    } catch { /* not configured yet — leave empty */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const link = async () => {
    if (!phone.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/bot/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'הקישור נכשל');
      setPhone(''); setMsg('✅ המספר קושר — עכשיו הבוט יענה לך עם הנתונים שלך.'); load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'הקישור נכשל'); }
    setBusy(false);
  };

  const unlink = async (identifier: string) => {
    setBusy(true); setMsg(null);
    try {
      await fetch(`/api/bot/link?phone=${encodeURIComponent(identifier)}`, { method: 'DELETE' });
      setMsg('הקישור הוסר.'); load();
    } catch { setMsg('ההסרה נכשלה'); }
    setBusy(false);
  };

  const inputStyle: React.CSSProperties = { flex: 1, padding: '9px 11px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit' };
  const btnStyle: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 };

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 28, background: '#fafafa' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>קישור וואטסאפ</h2>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>
        קשר/י את מספר הוואטסאפ שלך כדי שהבוט יזהה אותך כמנהל/ת ויענה בפקודות התפעול (קביעת תורים, ייבוא, סטטוס) עם הנתונים של העסק שלך.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          style={inputStyle} type="tel" inputMode="tel" dir="ltr"
          placeholder="972501234567" value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) link(); }}
          disabled={busy}
        />
        <button style={btnStyle} onClick={link} disabled={busy}>קישור</button>
      </div>
      {msg && <p style={{ fontSize: 13, marginTop: 10, color: msg.startsWith('✅') ? '#16a34a' : '#b45309' }}>{msg}</p>}
      {links.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
          {links.map((id) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span dir="ltr" style={{ fontFamily: 'monospace' }}>{id}</span>
              <span style={{ color: '#16a34a' }}>מקושר</span>
              <button onClick={() => unlink(id)} disabled={busy} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 13, padding: 0 }}>הסר</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
