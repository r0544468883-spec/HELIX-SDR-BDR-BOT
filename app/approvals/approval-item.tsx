'use client';
import { useState } from 'react';

export function ApprovalItem({ item }: { item: { id: string; title: string; body: string | null; kind: string; channel: string | null; status: string } }) {
  const [status, setStatus] = useState(item.status);
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    try {
      const res = await fetch('/api/approvals/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, decision }),
      });
      const data = await res.json();
      setStatus(data.status ?? status);
    } finally {
      setBusy(false);
    }
  }

  const done = status === 'approved' || status === 'rejected' || status === 'executed';

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{item.title}</div>
          {item.body && <div style={{ whiteSpace: 'pre-wrap', color: '#374151', fontSize: 14 }}>{item.body}</div>}
          <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>{item.kind} · {item.channel ?? '—'}</div>
        </div>
        {done ? (
          <span style={{ fontSize: 13, color: status === 'rejected' ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
            {status === 'rejected' ? '✋ נדחה' : '✅ אושר'}
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy} onClick={() => decide('approve')}
              style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
              ✅ אשר ושלח
            </button>
            <button disabled={busy} onClick={() => decide('reject')}
              style={{ background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
              ✋ דחה
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
