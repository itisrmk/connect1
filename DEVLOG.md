# Connect1 Development Log

## 2026-03-08 — Project Inception

### What was done
- **Market research completed**: Analyzed 15+ competitors (Composio, Nango, Merge, Unified.to, Paragon, etc.)
- **Strategic positioning defined**: Open-source, MCP-native, normalized schemas — differentiates from Composio (closed) and Nango (not AI-native)
- **Tech stack chosen**: TypeScript, Hono, Supabase (PostgreSQL), Render, Drizzle ORM
- **Monorepo scaffolded** with Turborepo + npm workspaces

### Architecture built
- `packages/core` — SDK with domain schemas (Email, Messaging, Files, Tasks, CRM, Calendar), base connector class, encryption utils, client
- `packages/db` — Drizzle ORM schemas for tenants, API keys, connections (encrypted creds), OAuth states, webhooks, event log
- `packages/mcp-server` — MCP server exposing all connectors as AI agent tools (10 tools: list_emails, send_email, list_channels, send_message, list_files, etc.)
- `apps/api` — Hono REST API with auth middleware, OAuth flow, and domain routes
- `connectors/gmail` — Full Gmail connector (list, get, send, OAuth)
- `connectors/slack` — Full Slack connector (channels, messages, send, OAuth)
- `connectors/google-drive` — Google Drive connector (list, get files, OAuth)
- `connectors/notion` — Notion connector (search, query database, create page, OAuth)

### Key decisions
- **Supabase + Render** for infrastructure (free tiers, good DX)
- **AES-256-GCM encryption** for stored OAuth tokens
- **Auto token refresh** with 5-minute buffer before expiry
- **Normalized schemas with raw passthrough** — every domain object has a `raw` field for provider-specific data
- **MCP-native** — every connector automatically becomes an AI agent tool

### What's next
- [x] Install dependencies and verify build ✓ all 8 packages compile
- [x] Set up Supabase project and push schema ✓ 6 tables, RLS policies, seed data
- [ ] Set up Render deployment
- [ ] Add Google Calendar connector
- [ ] Add webhook/event system
- [ ] Build developer dashboard (console)
- [ ] Write quickstart documentation
- [ ] Publish `connect1` to npm

## 2026-03-09 — API Running Against Supabase

### What was done
- Connected API to Supabase PostgreSQL (pooler: `aws-1-us-east-2`)
- Added dotenv config loading for local dev
- SQL schema deployed: `tenants`, `api_keys`, `connections`, `oauth_states`, `webhooks`, `event_log`
- RLS policies enabled (service_role full access)
- Seeded test tenant + API key (`c1_dev_test_key_1234567890abcdef`)
- All endpoints verified working:
  - `GET /` — API info
  - `GET /v1/auth/providers` — lists 4 connectors
  - `GET /v1/connections` (authenticated) — returns connections from Supabase
  - `GET /v1/connections` (no auth) — returns 401
- AES-256-GCM encryption key generated for token vault

### Issues resolved
- Supabase pooler region mismatch (`us-east-1` vs `us-east-2`)
- TypeScript strict mode fixes for fetch response typing
- Hono context typing with custom `AppEnv` type
- Turborepo `packageManager` field requirement

## 2026-03-09 — Bring Your Own OAuth (BYOO) Architecture

### What was done
- **Architectural shift**: Removed all hardcoded OAuth credentials from connectors
- Connectors now only define endpoints (`authUrl`, `tokenUrl`, `defaultScopes`) — no secrets
- New `oauth_apps` table: tenants register their own OAuth client credentials
- Credentials encrypted with AES-256-GCM before storage (same vault pattern)
- New API endpoints:
  - `POST /v1/auth/oauth-apps` — Register OAuth app (encrypt + store)
  - `GET /v1/auth/oauth-apps` — List registered apps (never exposes secrets)
  - `POST /v1/auth/connect` — Now requires registered OAuth app, returns error if missing
- OAuth flow, token exchange, and token refresh all use tenant's credentials at runtime
- Full flow tested end-to-end:
  1. Connect without OAuth app → clear error message
  2. Register OAuth app → encrypted, stored
  3. Connect with OAuth app → returns valid Google OAuth URL with tenant's client_id

### Why this matters
- **Legal**: Shifts Google CASA audit + API ToS compliance to the tenant
- **Security**: Connect1 never owns OAuth apps — reduced liability
- **Competitive**: Same model as Nango/Composio — industry standard
- **Trust**: Tenants keep full control of their OAuth credentials

### What's next
- [ ] Set up Render deployment
- [ ] Add webhook/event system
- [ ] Build developer dashboard
- [ ] Add "managed OAuth" option (Connect1-owned apps) as premium feature

## 2026-03-09 — Phase 1: Ship-Ready API

### What was done

#### Security Fix
- **Split auth routes into public and protected**: OAuth callback + providers listing remain public; OAuth app registration, connect, and management now require API key auth
- **tenantId derived from API key** — no longer accepted in request body (prevented any caller from acting as any tenant)

#### Consistent Error Handling
- `Connect1APIError` class with `code`, `message`, `status`
- Global `app.onError()` handler — all errors return `{error: {code, message}}`
- Helper factories: `badRequest()`, `unauthorized()`, `notFound()`, `rateLimited()`, `providerError()`, `internal()`
- All route handlers now throw errors instead of try/catch + c.json

#### Rate Limiting
- Redis-based sliding window (1-hour windows)
- Per-tenant limits by plan: free=1000, starter=5000, pro=50000, enterprise=500000
- Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
- Returns `429` with `Retry-After` when exceeded
- Fails open if Redis unavailable (local dev without Redis still works)

#### Usage Tracking
- Daily Redis counters per tenant (`usage:{tenantId}:{date}`)
- 90-day retention for billing/analytics
- Piggybacked on rate limit middleware — zero extra latency

#### Tenant Self-Service
- `POST /v1/register` — create tenant, returns API key (public)
- `GET /v1/tenant/me` — tenant info (protected)
- `GET /v1/tenant/api-keys` — list keys (masked) (protected)
- `POST /v1/tenant/api-keys` — create additional keys (protected)
- `DELETE /v1/tenant/api-keys/:id` — revoke key (protected, prevents deleting last key)
- API keys generated with `c1_live_` prefix + 48 hex chars

#### Dockerfile
- Multi-stage build: builder (install + compile) → production (dist only)
- `node:22-slim` base for minimal image size
- `render.yaml` updated to use Docker runtime

### Tests passed (16/16)
1. Health check
2. Providers listing (public)
3. Tenant registration (returns API key)
4. Unauthenticated access → 401
5. Bad API key → 401
6. Tenant info via API key
7. List API keys (masked)
8. Create second API key
9. List connections (empty)
10. Register OAuth app (BYOO, protected)
11. List OAuth apps
12. Initiate OAuth flow (tenantId from API key, not body)
13. Connect without OAuth app → proper error
14. Duplicate email registration → proper error
15. Missing fields → proper error
16. Rate limit headers present on all responses

### What's next (Phase 2)
- [x] Google Calendar connector ✓
- [x] Route generalization (dynamic connector lookup) ✓
- [x] SDK client improvements ✓
- [x] Developer dashboard (Hono html templates + htmx) ✓

## 2026-03-09 — Phase 2: Calendar, Generalization, Dashboard

### What was done

#### Google Calendar Connector
- Full `GoogleCalendarConnector` with `listEvents`, `getEvent`, `createEvent`
- Normalizes Google Calendar API responses to unified `CalendarEvent` schema
- Supports `calendarId`, `timeMin`, `timeMax` query filters
- Defaults to upcoming events on primary calendar
- Attendee status mapping, all-day event handling, meeting URL extraction
- Registered in connector registry (id: `google-calendar`, 5th provider)

#### Route Generalization
- Created `getConnectionContext()` helper that resolves connector dynamically from connection's provider
- All domain routes (email, messaging, files, calendar) now use dynamic connector lookup
- Routes check for required methods (`listEmails`, `listChannels`, `listFiles`, `listEvents`) at runtime
- Enables multiple providers per domain (e.g. Gmail + future Outlook for email)

#### SDK Client Improvements
- Calendar namespace now supports `calendarId`, `timeMin`, `timeMax` query params
- Calendar `get()` and `create()` accept optional `calendarId`
- Added `oauthApps` namespace: `register()`, `list()`
- Added `tenant` namespace: `me()`, `apiKeys.list()`, `apiKeys.create()`, `apiKeys.revoke()`

#### Developer Dashboard
- Served at `/console` — no auth required (internal admin tool)
- Dark theme UI with htmx for dynamic loading
- Pages: Dashboard (stats), Connections, Providers, API Keys
- Dashboard shows live counts: tenants, connections, OAuth apps, providers
- Recent connections loaded via htmx partial
- Connections page shows provider, user, email, status
- Providers page shows all registered connectors with domains
- API Keys page shows masked keys, scopes, last used

#### MCP Server
- Added 3 calendar tools: `list_calendar_events`, `get_calendar_event`, `create_calendar_event`
- Total MCP tools: 12 (was 9)

#### Dockerfile
- Updated to include `google-calendar` connector in build and production stages

### Build results
- 9/9 packages compile successfully
- All connectors: gmail, slack, google-drive, notion, google-calendar

### What's next (Phase 3)
- [ ] Deploy to Render
- [ ] Documentation (quickstart, API reference, MCP setup guide)
- [ ] Publish `connect1` to npm
