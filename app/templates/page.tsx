'use client';
// Templates manager — view built-in templates and upload/edit your OWN for every
// message type (WhatsApp / Email / Canned replies). A custom entry with the same
// key OVERRIDES the built-in. Talks to /api/templates/{list,custom}, /api/canned.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type Tab = 'whatsapp' | 'email' | 'canned';

type WaItem = { key: string; name: string; language: string; category: string; body: string; params: string[]; sampleParams: string[]; quickReply: string[] | null; urlButton: { text: string; baseUrl: string } | null; auth: unknown; source: string; overrides: boolean };
type EmailItem = { key: string; title: string; step: number; subject: string; body: string; source: string; overrides: boolean };
type CannedItem = { key: string; title: string; body: string; triggers: string[] };

const C = {
  bg: '#0b0f14', card: '#141b24', line: '#1f2a36', text: '#e8eef5', dim: '#9fb0c3',
  accent: '#1f6feb', ok: '#16a34a', warn: '#b45309', danger: '#b91c1c',
};
const chip = (bg: string): React.CSSProperties => ({ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: bg, color: '#fff', whiteSpace: 'nowrap' });
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#0e141b', color: C.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
const btn = (bg: string): React.CSSProperties => ({ padding: '9px 16px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' });

export default function TemplatesPage() {
  const [tab, setTab] = useState<Tab>('whatsapp');
  const [wa, setWa] = useState<WaItem[]>([]);
  const [email, setEmail] = useState<EmailItem[]>([]);
  const [canned, setCanned] = useState<CannedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<null | { tab: Tab; data: Record<string, string> }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/templates/list');
      const j = await r.json();
      setWa(j.whatsapp ?? []); setEmail(j.email ?? []); setCanned(j.canned ?? []);
    } catch { toast.error('טעינה נכשלה'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ---- editor open helpers ----
  const newWa = () => setEditor({ tab: 'whatsapp', data: { key: '', name: '', language: 'he', category: 'UTILITY', body: '', params: '', sampleParams: '', quickReply: '', urlText: '', urlBase: '' } });
  const editWa = (i: WaItem) => setEditor({ tab: 'whatsapp', data: { key: i.key, name: i.name, language: i.language, category: i.category, body: i.body, params: i.params.join(', '), sampleParams: i.sampleParams.join(', '), quickReply: (i.quickReply ?? []).join(', '), urlText: i.urlButton?.text ?? '', urlBase: i.urlButton?.baseUrl ?? '' } });
  const newEmail = () => setEditor({ tab: 'email', data: { key: '', title: '', step: '5', subject: '', body: '' } });
  const editEmail = (i: EmailItem) => setEditor({ tab: 'email', data: { key: i.key, title: i.title, step: String(i.step), subject: i.subject, body: i.body } });
  const newCanned = () => setEditor({ tab: 'canned', data: { key: '', title: '', body: '', triggers: '' } });
  const editCanned = (i: CannedItem) => setEditor({ tab: 'canned', data: { key: i.key, title: i.title, body: i.body, triggers: i.triggers.join(', ') } });

  const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    if (!editor) return;
    const d = editor.data;
    if (!d.key.trim()) return toast.error('חובה מפתח (key)');
    try {
      if (editor.tab === 'whatsapp') {
        const definition: Record<string, unknown> = {
          name: d.name.trim(), language: d.language, category: d.category, body: d.body,
          params: splitList(d.params), sampleParams: splitList(d.sampleParams),
        };
        if (d.quickReply.trim()) definition.quickReply = splitList(d.quickReply);
        if (d.urlText.trim() && d.urlBase.trim()) definition.urlButton = { text: d.urlText.trim(), baseUrl: d.urlBase.trim() };
        if (d.category === 'AUTHENTICATION') definition.auth = { codeExpiryMinutes: 5, buttonText: 'העתקת הקוד' };
        const r = await fetch('/api/templates/custom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'whatsapp', key: d.key.trim(), definition }) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.results?.[0]?.error || j.error || 'שמירה נכשלה');
      } else if (editor.tab === 'email') {
        const definition = { title: d.title || d.key, step: Number(d.step) || 5, subject: d.subject, body: d.body };
        const r = await fetch('/api/templates/custom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'email', key: d.key.trim(), definition }) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.results?.[0]?.error || j.error || 'שמירה נכשלה');
      } else {
        const r = await fetch('/api/canned', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: d.key.trim(), title: d.title, body: d.body, triggers: splitList(d.triggers) }) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'שמירה נכשלה');
      }
      toast.success('נשמר ✓');
      setEditor(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שמירה נכשלה'); }
  };

  const remove = async (t: Tab, key: string) => {
    if (!confirm(`למחוק את "${key}"? (חוזר לברירת-המחדל אם קיימת)`)) return;
    const url = t === 'canned' ? `/api/canned?key=${encodeURIComponent(key)}` : `/api/templates/custom?kind=${t}&key=${encodeURIComponent(key)}`;
    await fetch(url, { method: 'DELETE' });
    toast.success('נמחק'); load();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'whatsapp', label: `WhatsApp (${wa.length})` },
    { id: 'email', label: `מייל (${email.length})` },
    { id: 'canned', label: `תשובות שמורות (${canned.length})` },
  ];

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 80px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>ניהול תבניות</h1>
        <p style={{ color: C.dim, fontSize: 14, marginBottom: 24 }}>צפייה בתבניות המובנות והעלאת תבניות משלך לכל סוג הודעה. תבנית מותאמת עם אותו מפתח דורסת את המובנית.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {tabs.map((tb) => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{ ...btn(tab === tb.id ? C.accent : C.card), border: `1px solid ${C.line}` }}>{tb.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={tab === 'whatsapp' ? newWa : tab === 'email' ? newEmail : newCanned} style={btn(C.ok)}>+ תבנית חדשה</button>
        </div>

        {loading ? <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>טוען…</div> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {tab === 'whatsapp' && wa.map((i) => (
              <Row key={i.key} title={i.name} sub={i.body} badges={[
                <span key="c" style={chip(i.category === 'MARKETING' ? C.warn : i.category === 'AUTHENTICATION' ? '#6d28d9' : '#334155')}>{i.category}</span>,
                i.source === 'custom' ? <span key="s" style={chip(C.ok)}>{i.overrides ? 'דורס מובנה' : 'מותאם'}</span> : <span key="s" style={chip('#334155')}>מובנה</span>,
                ...(i.quickReply ? [<span key="q" style={chip('#0e7490')}>Quick-Reply</span>] : []),
              ]} onEdit={() => editWa(i)} onDelete={i.source === 'custom' ? () => remove('whatsapp', i.key) : undefined} editLabel={i.source === 'custom' ? 'ערוך' : 'שכפל כמותאם'} />
            ))}
            {tab === 'email' && email.map((i) => (
              <Row key={i.key} title={`${i.step}. ${i.title}`} sub={`נושא: ${i.subject}`} badges={[
                i.source === 'custom' ? <span key="s" style={chip(C.ok)}>{i.overrides ? 'דורס מובנה' : 'מותאם'}</span> : <span key="s" style={chip('#334155')}>מובנה</span>,
              ]} onEdit={() => editEmail(i)} onDelete={i.source === 'custom' ? () => remove('email', i.key) : undefined} editLabel={i.source === 'custom' ? 'ערוך' : 'שכפל כמותאם'} />
            ))}
            {tab === 'canned' && canned.map((i) => (
              <Row key={i.key} title={i.title} sub={i.body} badges={[<span key="t" style={chip('#334155')}>{i.triggers.slice(0, 3).join('، ')}</span>]}
                onEdit={() => editCanned(i)} onDelete={() => remove('canned', i.key)} editLabel="ערוך" />
            ))}
          </div>
        )}
      </div>

      {editor && (
        <div onClick={() => setEditor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 560 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{editor.tab === 'whatsapp' ? 'תבנית WhatsApp' : editor.tab === 'email' ? 'תבנית מייל' : 'תשובה שמורה'}</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="מפתח (key)"><input style={input} value={editor.data.key} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, key: e.target.value } })} placeholder="למשל price / my_promo" /></Field>

              {editor.tab === 'whatsapp' && <>
                <Field label="שם התבנית ב-Meta (a-z0-9_)"><input style={input} value={editor.data.name} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') } })} /></Field>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Field label="קטגוריה"><select style={input} value={editor.data.category} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, category: e.target.value } })}><option>UTILITY</option><option>MARKETING</option><option>AUTHENTICATION</option></select></Field>
                  <Field label="שפה"><input style={input} value={editor.data.language} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, language: e.target.value } })} /></Field>
                </div>
                <Field label="גוף ההודעה ({{1}}, {{2}}…)"><textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} value={editor.data.body} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, body: e.target.value } })} /></Field>
                <Field label="פרמטרים (תיאור, מופרד בפסיקים)"><input style={input} value={editor.data.params} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, params: e.target.value } })} placeholder="שם, תאריך, שעה" /></Field>
                <Field label="דוגמאות לפרמטרים (מופרד בפסיקים)"><input style={input} value={editor.data.sampleParams} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, sampleParams: e.target.value } })} placeholder="דנה, 12/08, 10:30" /></Field>
                <Field label="כפתורי Quick-Reply (אופציונלי, מופרד בפסיקים)"><input style={input} value={editor.data.quickReply} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, quickReply: e.target.value } })} placeholder="אישור, ביטול" /></Field>
              </>}

              {editor.tab === 'email' && <>
                <Field label="כותרת"><input style={input} value={editor.data.title} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, title: e.target.value } })} /></Field>
                <Field label="שלב ברצף"><input style={input} type="number" value={editor.data.step} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, step: e.target.value } })} /></Field>
                <Field label="נושא ({{name}}, {{company}}…)"><input style={input} value={editor.data.subject} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, subject: e.target.value } })} /></Field>
                <Field label="גוף המייל"><textarea style={{ ...input, minHeight: 120, resize: 'vertical' }} value={editor.data.body} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, body: e.target.value } })} /></Field>
              </>}

              {editor.tab === 'canned' && <>
                <Field label="כותרת"><input style={input} value={editor.data.title} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, title: e.target.value } })} /></Field>
                <Field label="תוכן התשובה"><textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} value={editor.data.body} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, body: e.target.value } })} /></Field>
                <Field label="מילות טריגר (מופרד בפסיקים)"><input style={input} value={editor.data.triggers} onChange={(e) => setEditor({ ...editor, data: { ...editor.data, triggers: e.target.value } })} placeholder="מחיר, כמה עולה, עלות" /></Field>
              </>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-start' }}>
              <button onClick={save} style={btn(C.accent)}>שמירה</button>
              <button onClick={() => setEditor(null)} style={{ ...btn('#22303c') }}>ביטול</button>
            </div>
            {editor.tab === 'whatsapp' && <p style={{ color: C.dim, fontSize: 12, marginTop: 12 }}>אחרי שמירה — הרץ סנכרון (/api/templates/sync) ואשר את התבנית ב-WhatsApp Manager.</p>}
          </div>
        </div>
      )}
    </main>
  );
}

function Row({ title, sub, badges, onEdit, onDelete, editLabel }: { title: string; sub: string; badges: React.ReactNode[]; onEdit: () => void; onDelete?: () => void; editLabel: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          {badges}
        </div>
        <div style={{ color: C.dim, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
      <button onClick={onEdit} style={{ ...btn('#22303c'), padding: '7px 12px' }}>{editLabel}</button>
      {onDelete && <button onClick={onDelete} style={{ ...btn('transparent'), color: '#f87171', padding: '7px 10px', border: `1px solid ${C.line}` }}>מחק</button>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', flex: 1 }}>
      <span style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}
