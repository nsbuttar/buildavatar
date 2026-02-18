# Threat Model and Security Notes

## Assets

- User identity and profile data
- Connector credentials (OAuth/API tokens)
- Knowledge corpus (files, social content, embeddings)
- Conversation history and extracted memories
- Audit and operational logs

## Trust Boundaries

- Browser client <-> Next.js API
- API <-> Postgres/Redis/S3/OpenAI/provider APIs
- Worker processes <-> queue and DB

## Primary Threats and Mitigations

1. Credential leakage
- Mitigation: connector tokens/secrets encrypted at rest (`AES-256-GCM`) before DB write
- Mitigation: never returned in API responses

2. Prompt injection/data poisoning
- Mitigation: strict system policy in RAG prompts
- Mitigation: source citations in responses
- Mitigation: tool actions constrained by allowlisted registry

3. Unsafe agent side effects
- Mitigation: no external send actions in MVP
- Mitigation: destructive/data-affecting tools require explicit confirmation

4. Unauthorized data access
- Mitigation: session-bound API guards (`requireUserId`)
- Mitigation: per-user scoping in repository queries

5. Privacy violations
- Mitigation: explicit learning toggle
- Mitigation: memory inspect/edit/delete UI
- Mitigation: export + hard delete endpoints

6. Voice impersonation abuse
- Mitigation: voice clone profile requires explicit consent checkbox + sample upload
- Mitigation: neutral voice fallback if consent/profile missing

## Operational Safeguards

- Structured logs with request IDs
- Audit log table for sensitive actions
- Rate limiting per user/route (in-memory MVP limiter)
- Queue retries and failure retention in BullMQ

## Known Gaps / Next Hardening Steps

- Add KMS-managed encryption key rotation
- Move rate limiting to Redis-based distributed limiter
- Add row-level security policies if using Supabase directly
- Add malware scanning for uploaded files
- Add content moderation pipeline for memory writes
- Add SIEM export hooks for audit events

