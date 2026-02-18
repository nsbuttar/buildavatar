# Avatar OS

Production-ready scaffold for a privacy-first personal avatar platform:

- Data ingestion from connectors + file drops
- Vectorized "avatar brain" in Postgres/pgvector
- RAG chat with citations
- Long-term memory extraction, inspection, and editing
- Safe agent mode with confirmation gates
- Talking avatar (TTS + viseme lip-sync)

## Monorepo Layout

- `apps/web`: Next.js App Router UI + API routes
- `apps/worker`: BullMQ workers (ingestion, sync, reflection)
- `packages/core`: shared domain types, adapters, services, repositories
- `db/migrations`: SQL migrations
- `scripts`: migration/seed scripts

## Implemented Non-Negotiables

- Privacy-first:
  - encrypted connector credentials (`connections.encrypted_tokens`, `connections.encrypted_secrets`)
  - audit logs (`audit_logs`)
  - export/delete endpoints (`/api/privacy/export`, `/api/privacy/delete`)
- Clear AI boundary:
  - UI labels avatar as AI-generated
  - prompts enforce "no human impersonation"
- Voice consent gate:
  - voice cloning profile only created with explicit consent + sample upload
  - neutral voice fallback when consent is absent
- Memory control:
  - Memory Vault page supports list/create/edit/pin/delete
  - learning toggle (`allow_learning_from_conversations`)
- Modular adapters:
  - connectors, embeddings, LLM, vector store, TTS, storage are adapter-based

## Stack

- Frontend: Next.js 15, React 19, TypeScript, Tailwind
- Backend: Next API routes + shared Node services
- Auth: Auth.js (OAuth + session/JWT)
- DB: Postgres + pgvector
- Queue: BullMQ + Redis
- Storage: S3-compatible adapter + local fallback
- LLM/Embedding/TTS: OpenAI adapters + mocks fallback

## Connectors

- `github`: fully implemented (repo + README ingestion)
- `youtube`: implemented via YouTube Data API key + channel ID
- `x`: adapter skeleton (API-restricted; stub with explicit note)

## Setup

1. Install dependencies:
   - `pnpm install`
2. Copy env:
   - `cp .env.example .env` (or equivalent on Windows)
3. Choose runtime mode:
   - **Lite mode (no Docker / BIOS virtualization needed):**
     - set `APP_RUNTIME_MODE=lite`
     - run `pnpm dev:lite`
   - **Full mode (Postgres + Redis via Docker):**
     - keep `APP_RUNTIME_MODE=full`
     - run `docker compose up -d`
     - run `pnpm db:migrate`
     - optional: `pnpm db:seed`
     - run `pnpm dev`
4. Open:
   - `http://localhost:3000`

## Key Pages

- `/signin`: session auth
- `/onboarding`: avatar style profile + consent controls
- `/connections`: provider connection + sync status
- `/file-drop`: file upload and ingestion list
- `/chat`: RAG chat + citations + agent mode + avatar speech
- `/memory-vault`: memory inspect/edit/pin/delete
- `/admin`: logs, analytics, tasks, export/delete

## API Highlights

- `POST /api/files/upload`: queue file ingestion
- `POST /api/chat`: streaming RAG (SSE) or agent-mode JSON response
- `GET/POST/PATCH/DELETE /api/memories`: memory CRUD
- `POST /api/avatar/speak`: TTS + viseme cues
- `POST /api/avatar/voice-samples`: consent-gated voice profile creation
- `GET /api/admin/logs`: audit + analytics snapshot
- `GET/POST /api/admin/jobs`: queue stats, failed jobs, retry actions
- `POST /api/hooks/wake`: token-authenticated external wake event ingestion
- `POST /api/hooks/agent`: token-authenticated isolated agent run

## Agent Tools (MVP)

- `search_knowledge_base(query, k?, filters?)`
- `get_document(item_id)`
- `summarize(text | item_id)`
- `draft_email(context, tone?)`
- `create_task(title, notes?)` (confirmation required)

## Acceptance Test Checklist

1. PDF ingestion + citation:
   - Upload a PDF in `/file-drop`
   - wait for worker completion
   - ask a question in `/chat`
   - verify citation references file source
2. GitHub connector ingestion:
   - connect GitHub from `/connections`
   - run sync
   - ask repo/README question in `/chat`
   - verify citation references GitHub source
3. Memory loop + edit:
   - have a 10+ message conversation
   - confirm memories appear in `/memory-vault`
   - edit one memory
   - ask related question and verify response reflects edit
4. Learning OFF:
   - disable learning in `/onboarding`
   - run more conversation
   - confirm no new memories are created
5. Avatar speech:
   - enable Speak toggle in `/chat`
   - confirm audio playback and mouth animation
6. Data deletion behavior:
   - delete uploaded item in `/file-drop` or disconnect provider in `/connections`
   - verify item/chunks are soft-deleted and excluded from retrieval

## Security Notes

See `docs/threat-model.md`.

## Commands

- `pnpm dev`: run web + worker
- `pnpm dev:lite`: run browser app in in-process lite mode (no Docker)
- `pnpm dev:web`: run web app only
- `pnpm build`: build all packages
- `pnpm test`: run test suites
- `pnpm typecheck`: run TS checks
- `pnpm db:migrate`: apply SQL migrations
- `pnpm db:seed`: seed demo user/memories

