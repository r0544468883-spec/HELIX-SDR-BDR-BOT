// Email via Resend REST API (no SDK dependency). Unlimited proactive notifies.
// Approve/reject rendered as links back to /api/webhooks/email-approve.
import type { ChannelConfig, SendResult, ApprovalButtons } from './types';

async function resendSend(from: string, to: string[], subject: string, html: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key || to.length === 0) return { ok: false, error: 'email_not_configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: json.message ?? `email_${res.status}` };
    return { ok: true, externalId: json.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function from(config: ChannelConfig): string {
  return (config.from as string) || process.env.RESEND_FROM || 'HELIX SDR <onboarding@resend.dev>';
}

export async function sendEmail(config: ChannelConfig, content: string): Promise<SendResult> {
  const recipients = (config.recipients as string[] | undefined) ?? [];
  const subject = (config.subject as string) || 'עדכון מ-HELIX SDR';
  return resendSend(from(config), recipients, subject, `<p>${content}</p>`, content);
}

/** NOTIFY + ASK via email: reply-to-approve links (GET /api/webhooks/email-approve?token=...&decision=...). */
export async function sendEmailApproval(
  config: ChannelConfig,
  content: string,
  buttons: ApprovalButtons,
): Promise<SendResult> {
  const recipients = (config.recipients as string[] | undefined) ?? [];
  const base = process.env.APP_URL ?? '';
  const approveUrl = `${base}/api/webhooks/email-approve?d=${encodeURIComponent(buttons.approveData)}`;
  const rejectUrl = `${base}/api/webhooks/email-approve?d=${encodeURIComponent(buttons.rejectData)}`;
  const html = `<p>${content}</p>
    <p>
      <a href="${approveUrl}" style="background:#16a34a;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;margin-inline-end:8px">${buttons.approveLabel}</a>
      <a href="${rejectUrl}" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">${buttons.rejectLabel}</a>
    </p>`;
  const text = `${content}\n\n${buttons.approveLabel}: ${approveUrl}\n${buttons.rejectLabel}: ${rejectUrl}`;
  return resendSend(from(config), recipients, (config.subject as string) || 'אישור נדרש — HELIX SDR', html, text);
}
