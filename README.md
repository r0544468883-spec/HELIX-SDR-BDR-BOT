# HELIX SDR-BDR-BOT 🤖

Standalone AI SDR/BDR + Contact Research + Data Enrichment product for the HELIX ecosystem.
Hebrew-first · compliance-first · own-first enrichment (not a data reseller).

> **Spec:** `../PRODUCTS/03-helix-sdr-bdr-bot.md` (full product spec, data model, reuse map, provider catalog).

## What this is

A **standalone** product (its own repo + Supabase) that connects to **Product 02 (HELIX Dashboards)** as a metrics super-layer. Bootstrapped from [`firecrawl/fire-enrich`](https://github.com/firecrawl/fire-enrich) (MIT) — the enrichment engine + UI — and being adapted to the HELIX stack (Claude, Supabase, Hebrew/RTL, own-first waterfall).

## Stack

- **Next.js 15** (App Router) + **React 19** + **shadcn/ui** + Tailwind
- **Firecrawl** — scrape engine (waterfall layer 1, own-first)
- **Claude** (Anthropic) — research synthesis + message generation *(swap in progress — see `MIGRATION-CLAUDE.md`)*
- **Supabase** — accounts / contacts / enrichment_fields (+ pgvector for conversation memory)
- **Ollama** (optional) — local model for high-volume low-stakes tasks (classify, embeddings, dedup)

## Setup

```bash
cp .env.example .env.local        # fill Firecrawl + Anthropic + Supabase keys
npm install
# create DB: run supabase/schema.sql in the Supabase SQL editor
npm run dev                       # http://localhost:3000
```

## Status — V1 vertical slice

Building the **Search/Research → own-layer enrichment** slice first (spec roadmap stage 1+2):
domain → Firecrawl scrape → extract → email permutation + verify → enriched profile + sources.
External providers (Apollo/Lusha/Hunter) are **layer-2 fallback, BYO-key, optional** — the product works fully without them.

## HELIX integration

- `lib/helix/supabase.ts` — own DB clients
- `lib/helix/dashboards.ts` — pushes metrics to Product 02 (no-op until `HELIX_DASHBOARDS_URL` set)
- Reuse targets (port, don't rewrite): PLUG edge functions (`scrape-company`, `sync-emails`, `deduct-credits`), helix-ops AgentOS (`model-router`, `content-agent`). See spec §4.5.

## Attribution

Enrichment engine derived from [fire-enrich](https://github.com/firecrawl/fire-enrich) (MIT, © Firecrawl).
