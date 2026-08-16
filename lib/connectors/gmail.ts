// Gmail connector — send AS the connected user, and read inbound replies. Plain
// fetch to the Gmail REST API with the workspace's OAuth access token. This is what
// gives the SDR real eyes+voice: it sends from the user's own mailbox (deliverable,
// personal) and reads the replies that feed the objection-handler.
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function b64url(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

/** Send a plain-text email from the connected mailbox. Returns the messageId or null. */
export async function sendGmail(
  accessToken: string,
  msg: { to: string; from?: string; subject: string; body: string; inReplyTo?: string },
): Promise<{ id: string; threadId: string } | null> {
  const headers = [
    `To: ${msg.to}`,
    msg.from ? `From: ${msg.from}` : '',
    `Subject: ${msg.subject}`,
    msg.inReplyTo ? `In-Reply-To: ${msg.inReplyTo}` : '',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    msg.body,
  ].filter(Boolean).join('\r\n');

  const res = await fetch(`${API}/messages/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64url(headers) }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { id?: string; threadId?: string };
  return j.id ? { id: j.id, threadId: j.threadId ?? j.id } : null;
}

export interface InboundMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  text: string;
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

function extractText(payload: Part | undefined): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return b64urlDecode(payload.body.data);
  for (const p of payload.parts ?? []) {
    const t = extractText(p);
    if (t) return t;
  }
  return '';
}

/** Read recent inbound messages (default: last 2 days, inbox). Feeds the objection-handler. */
export async function listInbound(accessToken: string, query = 'in:inbox newer_than:2d'): Promise<InboundMessage[]> {
  const listRes = await fetch(`${API}/messages?q=${encodeURIComponent(query)}&maxResults=20`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) return [];
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const out: InboundMessage[] = [];
  for (const m of (list.messages ?? []).slice(0, 20)) {
    const msgRes = await fetch(`${API}/messages/${m.id}?format=full`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) continue;
    const full = (await msgRes.json()) as {
      id: string;
      threadId: string;
      payload?: Part & { headers?: { name: string; value: string }[] };
    };
    const hdr = (name: string) => full.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
    out.push({
      id: full.id,
      threadId: full.threadId,
      from: hdr('from'),
      subject: hdr('subject'),
      text: extractText(full.payload),
    });
  }
  return out;
}
