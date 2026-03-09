# Connect1 Architecture

## System Overview

```
┌─────────────────────────────────────────────────────┐
│              Developer's AI Application              │
│         (using any AI framework or agent)            │
└──────────┬─────────────────────┬────────────────────┘
           │ npm SDK             │ MCP / REST API
┌──────────▼─────────────────────▼────────────────────┐
│               Connect1 Gateway (Hono)                │
│                                                      │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ API Key    │  │  OAuth      │  │  Rate        │  │
│  │ Auth       │  │  Engine     │  │  Limiter     │  │
│  └────────────┘  └─────────────┘  └──────────────┘  │
│                                                      │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ Schema     │  │  Token      │  │  Event       │  │
│  │ Normalizer │  │  Vault      │  │  Router      │  │
│  │            │  │  (AES-256)  │  │              │  │
│  └────────────┘  └─────────────┘  └──────────────┘  │
└──────────┬─────────────────────┬────────────────────┘
           │                     │
┌──────────▼──┐  ┌──────────────▼─────────────────────┐
│  Supabase   │  │        Connector Layer              │
│  ┌────────┐ │  │  ┌──────┐ ┌─────┐ ┌──────┐        │
│  │Postgres│ │  │  │Gmail │ │Slack│ │GDrive│        │
│  │        │ │  │  └──────┘ └─────┘ └──────┘        │
│  │- tenant│ │  │  ┌──────┐ ┌─────┐ ┌──────┐        │
│  │- conns │ │  │  │Notion│ │Jira │ │ ...  │        │
│  │- keys  │ │  │  └──────┘ └─────┘ └──────┘        │
│  │- events│ │  └────────────────────────────────────┘
│  └────────┘ │
│  ┌────────┐ │
│  │ Redis  │ │  (via Render)
│  │- queues│ │
│  │- cache │ │
│  └────────┘ │
└─────────────┘
```

## Package Structure

### `packages/core` (npm: `connect1`)
The public SDK that developers install. Contains:
- **Domain schemas**: Normalized types for Email, Messaging, Files, Tasks, CRM, Calendar
- **Client**: HTTP client for the Connect1 API
- **BaseConnector**: Abstract class all connectors extend
- **Encryption**: AES-256-GCM for token storage

### `packages/db` (internal: `@connect1/db`)
Database layer using Drizzle ORM + Supabase PostgreSQL:
- **tenants**: Companies using Connect1
- **api_keys**: Per-tenant authentication
- **connections**: User-provider links with encrypted OAuth tokens
- **oauth_states**: Temporary storage for OAuth flow verification
- **webhooks**: Tenant webhook subscriptions
- **event_log**: Audit trail of all actions

### `packages/mcp-server` (npm: `@connect1/mcp-server`)
MCP server that exposes all connectors as AI agent tools. Works with Claude Desktop, Cursor, VS Code, and any MCP-compatible client.

### `apps/api` (deployed on Render)
Hono-based REST API server:
- `POST /v1/auth/connect` — Start OAuth flow
- `GET /v1/auth/callback` — OAuth callback
- `GET /v1/connections` — List connections
- `GET/POST /v1/email/:connId/*` — Email operations
- `GET/POST /v1/messaging/:connId/*` — Messaging operations
- `GET /v1/files/:connId/*` — File operations

### `connectors/*`
Individual service connectors, each implementing `BaseConnector`:
- **gmail**: Read, send emails via Gmail API
- **slack**: Channels, messages, send via Slack API
- **google-drive**: List, get files via Drive API
- **notion**: Search, query databases, create pages via Notion API

## Auth Flow

```
Developer App                Connect1 API               Provider (e.g. Google)
     │                            │                            │
     │  POST /v1/auth/connect     │                            │
     │  {provider, userId}        │                            │
     │ ──────────────────────────>│                            │
     │                            │  Store OAuth state         │
     │    {url: oauth_url}        │                            │
     │ <──────────────────────────│                            │
     │                            │                            │
     │  Redirect user to url      │                            │
     │ ───────────────────────────────────────────────────────>│
     │                            │                            │
     │                            │  GET /callback?code=...    │
     │                            │ <──────────────────────────│
     │                            │                            │
     │                            │  Exchange code for tokens  │
     │                            │ ──────────────────────────>│
     │                            │  {access_token, refresh}   │
     │                            │ <──────────────────────────│
     │                            │                            │
     │                            │  Encrypt & store tokens    │
     │                            │                            │
     │  Redirect with connectionId│                            │
     │ <──────────────────────────│                            │
```

## Security Model

- **API keys**: Bearer token auth for all API calls (per-tenant)
- **Token encryption**: AES-256-GCM with random IV per encryption
- **Auto-refresh**: Tokens refreshed proactively (5-min buffer before expiry)
- **Scoped access**: OAuth scopes configured per connector, minimal permissions requested
- **Tenant isolation**: All queries scoped to tenant via API key lookup

## Deployment (Render)

- **Web Service**: `apps/api` — Hono server on Node.js
- **Redis**: For BullMQ job queues and rate limiting (future)
- **Environment**: All secrets via Render environment variables
- **Database**: Supabase (external) — PostgreSQL with connection pooling
