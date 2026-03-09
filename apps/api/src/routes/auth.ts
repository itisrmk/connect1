import { Hono } from "hono";
import { createDb, connections, oauthStates, oauthApps } from "@connect1/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, type OAuthClientCredentials } from "connect1";
import { getConnector, listProviders } from "../lib/connectors.js";
import { encryptCredentials } from "../lib/credentials.js";
import { badRequest, notFound, internal } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

// Public routes — no auth required
export const authPublicRoutes = new Hono();

// Protected routes — require API key, tenantId from context
export const authProtectedRoutes = new Hono<AppEnv>();

let db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!db) db = createDb(process.env.DATABASE_URL!);
  return db;
}

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY not set");
  return key;
}

async function getTenantOAuthCredentials(
  tenantId: string,
  provider: string
): Promise<OAuthClientCredentials | null> {
  const database = getDb();

  const [app] = await database
    .select()
    .from(oauthApps)
    .where(
      and(eq(oauthApps.tenantId, tenantId), eq(oauthApps.provider, provider))
    )
    .limit(1);

  if (!app) return null;

  return {
    clientId: decrypt(app.clientId, getEncryptionKey()),
    clientSecret: decrypt(app.clientSecret, getEncryptionKey()),
    scopes: app.scopes ?? undefined,
  };
}

// ==========================================
// PUBLIC ROUTES
// ==========================================

// List available providers
authPublicRoutes.get("/providers", (c) => {
  return c.json({ providers: listProviders() });
});

// OAuth callback — must be public (Google/Slack redirects here)
authPublicRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    throw badRequest(`OAuth error: ${error}`, "OAUTH_ERROR");
  }

  if (!code || !state) {
    throw badRequest("Missing code or state");
  }

  const database = getDb();

  const [oauthState] = await database
    .select()
    .from(oauthStates)
    .where(eq(oauthStates.state, state))
    .limit(1);

  if (!oauthState) {
    throw badRequest("Invalid or expired state", "INVALID_STATE");
  }

  if (new Date() > oauthState.expiresAt) {
    throw badRequest("OAuth state expired", "STATE_EXPIRED");
  }

  const connector = getConnector(oauthState.provider);
  if (!connector) {
    throw internal("Provider not found");
  }

  const clientCredentials = await getTenantOAuthCredentials(
    oauthState.tenantId,
    oauthState.provider
  );
  if (!clientCredentials) {
    throw internal("OAuth app not found for tenant");
  }

  const redirectUri = `${process.env.API_BASE_URL}/v1/auth/callback`;

  const credentials = await connector.exchangeCode(
    code,
    redirectUri,
    clientCredentials
  );

  const [connection] = await database
    .insert(connections)
    .values({
      tenantId: oauthState.tenantId,
      userId: oauthState.userId,
      provider: oauthState.provider,
      status: "active",
      credentials: encryptCredentials(credentials),
      scopes: credentials.scope?.split(" ") ?? [],
      tokenExpiresAt: credentials.expiresAt
        ? new Date(credentials.expiresAt)
        : null,
    })
    .returning();

  // Clean up state
  await database
    .delete(oauthStates)
    .where(eq(oauthStates.id, oauthState.id));

  if (oauthState.redirectUrl) {
    const url = new URL(oauthState.redirectUrl);
    url.searchParams.set("connectionId", connection.id);
    url.searchParams.set("provider", oauthState.provider);
    return c.redirect(url.toString());
  }

  return c.json({
    connectionId: connection.id,
    provider: oauthState.provider,
    status: "active",
  });
});

// ==========================================
// PROTECTED ROUTES (require API key)
// ==========================================

// Register OAuth app (BYOO)
authProtectedRoutes.post("/oauth-apps", async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json<{
    provider: string;
    clientId: string;
    clientSecret: string;
    scopes?: string[];
    redirectUri?: string;
  }>();

  if (!body.provider || !body.clientId || !body.clientSecret) {
    throw badRequest("provider, clientId, and clientSecret are required");
  }

  const connector = getConnector(body.provider);
  if (!connector) {
    throw badRequest(`Unknown provider: ${body.provider}`);
  }

  const database = getDb();
  const encKey = getEncryptionKey();

  // Upsert
  const existing = await database
    .select({ id: oauthApps.id })
    .from(oauthApps)
    .where(
      and(eq(oauthApps.tenantId, tenantId), eq(oauthApps.provider, body.provider))
    )
    .limit(1);

  if (existing.length > 0) {
    await database
      .update(oauthApps)
      .set({
        clientId: encrypt(body.clientId, encKey),
        clientSecret: encrypt(body.clientSecret, encKey),
        scopes: body.scopes ?? [],
        redirectUri: body.redirectUri ?? null,
        updatedAt: new Date(),
      })
      .where(eq(oauthApps.id, existing[0].id));

    return c.json({ id: existing[0].id, updated: true });
  }

  const [app] = await database
    .insert(oauthApps)
    .values({
      tenantId,
      provider: body.provider,
      clientId: encrypt(body.clientId, encKey),
      clientSecret: encrypt(body.clientSecret, encKey),
      scopes: body.scopes ?? [],
      redirectUri: body.redirectUri ?? null,
    })
    .returning();

  return c.json({ id: app.id, created: true }, 201);
});

// List registered OAuth apps
authProtectedRoutes.get("/oauth-apps", async (c) => {
  const tenantId = c.get("tenantId");
  const database = getDb();

  const apps = await database
    .select({
      id: oauthApps.id,
      provider: oauthApps.provider,
      scopes: oauthApps.scopes,
      createdAt: oauthApps.createdAt,
    })
    .from(oauthApps)
    .where(eq(oauthApps.tenantId, tenantId));

  return c.json({ oauthApps: apps });
});

// Delete an OAuth app
authProtectedRoutes.delete("/oauth-apps/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const database = getDb();

  await database
    .delete(oauthApps)
    .where(and(eq(oauthApps.id, id), eq(oauthApps.tenantId, tenantId)));

  return c.json({ success: true });
});

// Initiate OAuth flow
authProtectedRoutes.post("/connect", async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json<{
    provider: string;
    userId: string;
    redirectUrl?: string;
  }>();

  if (!body.provider || !body.userId) {
    throw badRequest("provider and userId are required");
  }

  const connector = getConnector(body.provider);
  if (!connector) {
    throw badRequest(`Unknown provider: ${body.provider}`);
  }

  if (connector.config.authType !== "oauth2") {
    throw badRequest("Provider does not support OAuth");
  }

  const clientCredentials = await getTenantOAuthCredentials(
    tenantId,
    body.provider
  );
  if (!clientCredentials) {
    throw badRequest(
      `No OAuth app registered for provider "${body.provider}". Register one first via POST /v1/auth/oauth-apps`,
      "NO_OAUTH_APP"
    );
  }

  const state = randomBytes(32).toString("hex");
  const redirectUri = `${process.env.API_BASE_URL}/v1/auth/callback`;
  const database = getDb();

  await database.insert(oauthStates).values({
    state,
    tenantId,
    userId: body.userId,
    provider: body.provider,
    redirectUrl: body.redirectUrl ?? null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const url = connector.getOAuthUrl(state, redirectUri, clientCredentials);
  return c.json({ url });
});
