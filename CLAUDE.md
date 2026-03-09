# Connect1 — Universal Connector Layer for AI

## Project Overview
Connect1 is a unified integration platform for AI products. It provides authenticated, normalized, real-time access to third-party services (Gmail, Slack, Notion, Google Drive, etc.) via a single SDK, REST API, and MCP server.

## Architecture
- **Monorepo** managed with Turborepo + npm workspaces
- **Language**: TypeScript throughout
- **API Framework**: Hono (runs on Node.js + edge)
- **Database**: Supabase (PostgreSQL) via Drizzle ORM
- **Queue**: BullMQ + Redis (via Railway)
- **MCP**: `@modelcontextprotocol/sdk` for AI agent tool exposure
- **Deployment**: Render (API + workers + Redis), Supabase (DB + auth)

## Project Structure
```
Connect1/
├── packages/
│   ├── core/           # SDK — "connect1" npm package
│   ├── db/             # Drizzle schemas, migrations, Supabase client
│   └── mcp-server/     # MCP server exposing connectors as tools
├── apps/
│   └── api/            # Hono REST API server
├── connectors/         # Individual service connectors
│   ├── gmail/
│   ├── google-drive/
│   ├── slack/
│   └── notion/
└── docs/               # Architecture & dev documentation
```

## Key Conventions
- All connectors implement the `BaseConnector` interface from `packages/core`
- Normalized schemas live in `packages/core/src/domains/`
- Each connector has `auth.ts`, `read.ts`, `write.ts`, `events.ts`
- Environment variables: use `.env` locally, never commit secrets
- Database migrations via Drizzle Kit (`npx drizzle-kit generate` then `npx drizzle-kit push`)

## Commands
- `npm run dev` — Start API server in dev mode
- `npm run build` — Build all packages
- `npm run lint` — Lint all packages
- `npm run db:generate` — Generate Drizzle migrations
- `npm run db:push` — Push migrations to Supabase
- `npm run mcp` — Start MCP server locally

## Tech Decisions
- Supabase for PostgreSQL + auth + real-time (tokens stored AES-256 encrypted)
- Render for API deployment + Redis
- **Bring Your Own OAuth (BYOO)**: Tenants register their own OAuth apps via `POST /v1/auth/oauth-apps`. Connect1 never hardcodes OAuth credentials. Connectors only define endpoints (`authUrl`, `tokenUrl`, `defaultScopes`).
- Hono over Express for performance + edge compatibility
- Drizzle over Prisma for lightweight, SQL-close ORM
- Domain-based normalized schemas (Email, Calendar, Files, Messaging, Tasks, CRM)

## Style
- Use `type` over `interface` for domain schemas
- Prefer explicit error handling with Result types
- No default exports — use named exports everywhere
- Keep connectors independent — no cross-connector imports
