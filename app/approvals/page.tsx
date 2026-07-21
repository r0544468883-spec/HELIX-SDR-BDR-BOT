// HITL Approval Queue (spec §Screen 7) — the dashboard side of notify-and-approve.
import { supabaseAdmin } from '@/lib/helix/supabase';
import { ApprovalItem } from './approval-item';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  let items: { id: string; title: string; body: string | null; kind: string; channel: string | null; status: string }[] = [];
  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from('approval_queue')
      .select('id, title, body, kind, channel, status')
      .in('status', ['pending', 'notified'])
      .order('created_at', { ascending: false })
      .limit(50);
    items = (data ?? []) as typeof items;
  } catch {
    // Supabase not configured yet — render the empty state.
  }

  return (
    <main dir="rtl" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>תור אישורים</h1>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>
        פעולות שממתינות לאישורך לפני שליחה. אישור שולח מיד; דחייה מבטלת.
      </p>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 48 }}>
          אין פריטים ממתינים כרגע. כשיגיע משהו — תקבל התראה בטלגרם/מייל.
        </div>
      ) : (
        items.map((item) => <ApprovalItem key={item.id} item={item} />)
      )}
    </main>
  );
}
