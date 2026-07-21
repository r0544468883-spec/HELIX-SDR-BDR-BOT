// HELIX SDR-BDR-BOT — central LLM client (Claude).
//
// We reuse fire-enrich's OpenAI-SDK call sites verbatim and repoint them at
// Anthropic via the official OpenAI-compatibility endpoint. This keeps all the
// existing message/tool/response_format logic intact while running on Claude.
//   https://docs.anthropic.com/en/api/openai-sdk
//
// Caveat: the compat layer supports chat + tools + `response_format:{type:'json_object'}`.
// Strict `json_schema` (zodResponseFormat) is NOT supported — those call sites were
// converted to json_object (they already JSON.parse the result manually).
import OpenAI from 'openai';

/** Quality tier — research synthesis, message generation (the differentiator). */
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';
/** Fast/cheap tier — high-volume low-stakes calls (classify, corroborate, extract). */
export const CLAUDE_MODEL_FAST = process.env.CLAUDE_MODEL_FAST ?? 'claude-haiku-4-5-20251001';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/';

/**
 * OpenAI SDK client pointed at Anthropic. The optional `apiKey` param is kept for
 * call-site compatibility with the fire-enrich base but is ignored in favor of
 * ANTHROPIC_API_KEY (the base used to pass an OpenAI key here).
 */
export function createLLM(_apiKey?: string): OpenAI {
  return new OpenAI({
    apiKey: process.env.ANTHROPIC_API_KEY ?? _apiKey ?? '',
    baseURL: ANTHROPIC_BASE_URL,
  });
}
