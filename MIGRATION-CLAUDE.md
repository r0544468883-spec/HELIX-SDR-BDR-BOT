# Migration: OpenAI → Claude

fire-enrich ships wired to OpenAI (structured outputs via `openai` SDK + `zodResponseFormat`).
HELIX runs on **Claude** (spec: the AI layer is the differentiator). This is the swap plan.

## Approach

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
