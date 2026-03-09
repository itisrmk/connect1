import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";
import { createDb } from "@connect1/db";
import { apiKeys, tenants } from "@connect1/db";
import { eq } from "drizzle-orm";
import { unauthorized } from "../lib/errors.js";

let db: ReturnType<typeof createDb> | null = null;

function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");
    db = createDb(url);
  }
  return db;
}

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw unauthorized("Missing or invalid Authorization header");
  }

  const key = authHeader.slice(7);
  const database = getDb();

  const [apiKey] = await database
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.key, key))
    .limit(1);

  if (!apiKey || !apiKey.isActive) {
    throw unauthorized("Invalid API key");
  }

  const [tenant] = await database
    .select()
    .from(tenants)
    .where(eq(tenants.id, apiKey.tenantId))
    .limit(1);

  if (!tenant) {
    throw unauthorized("Tenant not found");
  }

  c.set("tenantId", tenant.id);
  c.set("tenant", tenant);
  c.set("apiKey", apiKey);

  // Update last used timestamp (non-blocking)
  database
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .catch(() => {});

  await next();
}
