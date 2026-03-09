import {
  encrypt,
  decrypt,
  type ConnectionCredentials,
  type OAuthClientCredentials,
} from "connect1";
import { createDb, connections, oauthApps } from "@connect1/db";
import { eq, and } from "drizzle-orm";
import { getConnector } from "./connectors.js";

let db: ReturnType<typeof createDb> | null = null;

function getDb() {
  if (!db) {
    db = createDb(process.env.DATABASE_URL!);
  }
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
  const encKey = getEncryptionKey();

  const [app] = await database
    .select()
    .from(oauthApps)
    .where(
      and(eq(oauthApps.tenantId, tenantId), eq(oauthApps.provider, provider))
    )
    .limit(1);

  if (!app) return null;

  return {
    clientId: decrypt(app.clientId, encKey),
    clientSecret: decrypt(app.clientSecret, encKey),
    scopes: app.scopes ?? undefined,
  };
}

export async function getCredentials(
  connectionId: string,
  tenantId: string
): Promise<ConnectionCredentials> {
  const database = getDb();

  const [conn] = await database
    .select()
    .from(connections)
    .where(
      and(eq(connections.id, connectionId), eq(connections.tenantId, tenantId))
    )
    .limit(1);

  if (!conn) throw new Error("Connection not found");
  if (conn.status !== "active") throw new Error("Connection is not active");

  const credentials: ConnectionCredentials = JSON.parse(
    decrypt(conn.credentials, getEncryptionKey())
  );

  // Auto-refresh if token is expired (with 5min buffer)
  if (
    credentials.expiresAt &&
    credentials.refreshToken &&
    credentials.expiresAt < Date.now() + 5 * 60 * 1000
  ) {
    const connector = getConnector(conn.provider);
    const clientCreds = await getTenantOAuthCredentials(
      tenantId,
      conn.provider
    );

    if (connector && clientCreds) {
      const refreshed = await connector.refreshAccessToken(
        credentials.refreshToken,
        clientCreds
      );

      // Save refreshed credentials
      await database
        .update(connections)
        .set({
          credentials: encrypt(
            JSON.stringify(refreshed),
            getEncryptionKey()
          ),
          tokenExpiresAt: refreshed.expiresAt
            ? new Date(refreshed.expiresAt)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(connections.id, connectionId));

      return refreshed;
    }
  }

  return credentials;
}

export async function getConnectionContext(
  connectionId: string,
  tenantId: string
) {
  const credentials = await getCredentials(connectionId, tenantId);
  const database = getDb();

  const [conn] = await database
    .select({ provider: connections.provider })
    .from(connections)
    .where(
      and(eq(connections.id, connectionId), eq(connections.tenantId, tenantId))
    )
    .limit(1);

  if (!conn) throw new Error("Connection not found");

  const connector = getConnector(conn.provider);
  if (!connector) throw new Error(`No connector found for provider: ${conn.provider}`);

  return { credentials, connector, provider: conn.provider };
}

export function encryptCredentials(
  credentials: ConnectionCredentials
): string {
  return encrypt(JSON.stringify(credentials), getEncryptionKey());
}
