# Migration: OpenAI → Claude ✅ DONE (V1)

fire-enrich shipped wired to OpenAI. HELIX runs on **Claude**. Swap completed via Anthropic's
**OpenAI-compatibility endpoint** — the lowest-risk path: all existing message/tool/response_format
logic stays; only the client + models were repointed.

## What was actually done
- `lib/helix/llm.ts` — `createLLM()` returns the OpenAI SDK pointed at `https://api.anthropic.com/v1/`
  + `CLAUDE_MODEL` (sonnet-5) / `CLAUDE_MODEL_FAST` (haiku-4.5).
- Replaced all 3 `new OpenAI(...)` → `createLLM(...)` (agent-base, services/openai, generate-fields).
- Replaced all model strings (`gpt-5`→CLAUDE_MODEL, `gpt-5-mini`→CLAUDE_MODEL_FAST).
- Converted 3 strict `zodResponseFormat` (json_schema) calls → `{type:'json_object'}` +
  manual/Zod parse (compat layer doesn't support strict json_schema).
- Routes/UI now gate on `ANTHROPIC_API_KEY` (X-Anthropic-API-Key header) instead of OpenAI.
- `next build` passes (types + lint).

## ⚠️ Runtime caveats (verify once ANTHROPIC_API_KEY is added)
- **json_object** on the compat layer expects "json" mentioned in the prompt — most prompts already
  ask for structured data; if any call returns prose, add an explicit "respond in JSON" line.
- If structured-output quality is insufficient, the targeted upgrade is Anthropic-native tool-use
  (or AI SDK `generateObject`) for the two enrichment calls in `lib/services/openai.ts`.
- Left `openai` + `@ai-sdk/openai` deps in place (unused) for easy rollback; remove once validated live.

## Original approach (reference)

Use the **Vercel AI SDK** (already a dependency: `ai`) with `@ai-sdk/anthropic` (added).
Replace OpenAI structured-output calls with `generateObject({ model: anthropic(...), schema })` —
provider-agnostic, keeps the existing Zod schemas untouched.

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
const { object } = await generateObject({
  model: anthropic(process.env.CLAUDE_MODEL ?? 'claude-sonnet-5'),
  schema: enrichmentSchema,        // existing Zod schema, unchanged
  prompt,
});
```

## Files to touch (from `grep openai|OpenAI|gpt-4`)

Core service:
- [ ] `lib/services/openai.ts` → `lib/services/claude.ts` (createEnrichmentSchema stays; swap the client call)
- [ ] `lib/services/specialized-agents.ts`

Agent architecture:
- [ ] `lib/agent-architecture/core/agent-base.ts` (central LLM call — swap here first, biggest leverage)
- [ ] `lib/agent-architecture/agents/{discovery,company-profile,funding,metrics,tech-stack}-agent.ts`
- [ ] `lib/agent-architecture/orchestrator.ts`, `index.ts`
- [ ] `lib/agent-architecture/tools/email-parser-tool.ts`

Strategies + API routes:
- [ ] `lib/strategies/{agent-enrichment,enrichment}-strategy.ts`
- [ ] `app/api/{chat,enrich,generate-fields}/route.ts`

UI copy (model labels only):
- [ ] `app/fire-enrich/{page,enrichment-table}.tsx`, `app/page.tsx`

## Order

1. `agent-base.ts` (most agents inherit the call from here).
2. Verify one agent (discovery) end-to-end against a real domain.
3. Roll through the rest, delete `lib/services/openai.ts` + `openai` dep when done.

Until complete, `OPENAI_API_KEY` keeps the base functional so the app runs during the swap.
