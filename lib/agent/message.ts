// HELIX SDR-BDR-BOT — message agent. Claude drafts a personalized outreach message
// from enriched contact data. Spec item 5 (concept ported from helix-ops content-agent.ts):
// draft → (Hebrew humanize) → AI-detection signal. Hebrew-first.
import { createLLM, CLAUDE_MODEL } from '@/lib/helix/llm';

export interface DraftInput {
  fullName?: string;
  title?: string;
  company?: string;
  industry?: string;
  techStack?: string;
  /** Personalization hooks — public professional footprint (spec §3.3). Optional. */
  hooks?: string[];
  /** Our offer / reason for reaching out. */
  offer: string;
  language?: 'he' | 'en';
  channel?: 'email' | 'whatsapp' | 'telegram' | 'linkedin';
}

export interface Draft {
  subject?: string;   // email only
  body: string;
  language: 'he' | 'en';
  aiScore: number;    // 0-100 "sounds AI" signal (lower = more human); gate before send
}

const CHANNEL_GUIDE: Record<string, string> = {
  email: 'Email: a subject line + 3-5 short sentences. Professional but warm.',
  whatsapp: 'WhatsApp: very short, personal, warm. 2-3 sentences. No subject.',
  telegram: 'Telegram: short and direct. No subject.',
  linkedin: 'LinkedIn: concise, professional, no subject. Reference shared professional context.',
};

/** Draft a personalized outreach message. Returns body (+ subject for email) and an AI-detection score. */
export async function draftOutreach(input: DraftInput): Promise<Draft> {
  const language = input.language ?? 'he';
  const channel = input.channel ?? 'email';
  const llm = createLLM();

  const facts = [
    input.fullName && `Name: ${input.fullName}`,
    input.title && `Title: ${input.title}`,
    input.company && `Company: ${input.company}`,
    input.industry && `Industry: ${input.industry}`,
    input.techStack && `Tech: ${input.techStack}`,
    input.hooks?.length && `Personalization hooks (reference ONE naturally): ${input.hooks.join(' | ')}`,
  ].filter(Boolean).join('\n');

  const sys = `You are an expert SDR copywriter. Write in ${language === 'he' ? 'natural, human Hebrew (not translated-sounding)' : 'English'}.
${CHANNEL_GUIDE[channel]}
Rules: use the buyer's context, not generic filler. One clear ask. No hype, no "I hope this finds you well". Sound like a real person.
Respond as JSON only: {"subject": string|null, "body": string, "aiScore": number}. aiScore = 0-100 estimate of how AI-generated the text sounds (be honest; lower is better).`;

  const user = `Prospect:\n${facts}\n\nOur offer / reason to reach out:\n${input.offer}\n\nWrite the ${channel} message.`;

  const completion = await llm.chat.completions.create({
    model: CLAUDE_MODEL,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    max_tokens: 700,
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed: { subject?: string | null; body?: string; aiScore?: number } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }

  return {
    subject: parsed.subject ?? undefined,
    body: parsed.body ?? '',
    language,
    aiScore: typeof parsed.aiScore === 'number' ? parsed.aiScore : 50,
  };
}
