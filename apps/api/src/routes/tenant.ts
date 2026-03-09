import { Hono } from "hono";
import { createDb, tenants, apiKeys } from "@connect1/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { badRequest } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

// Public routes (no auth required)
export const tenantPublicRoutes = new Hono();

// Protected routes (require API key)
export const tenantProtectedRoutes = new Hono<AppEnv>();

let db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!db) db = createDb(process.env.DATABASE_URL!);
  return db;
}

function generateApiKey(): string {
  return `c1_live_${randomBytes(24).toString("hex")}`;
}

// --- Public: Register a new tenant ---

tenantPublicRoutes.post("/register", async (c) => {
  const body = await c.req.json<{
    name: string;
    email: string;
  }>();

  if (!body.name || !body.email) {
    throw badRequest("name and email are required");
  }

  const database = getDb();

  // Check if email already exists
  const [existing] = await database
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.email, body.email))
    .limit(1);

  if (existing) {
    throw badRequest("Email already registered", "EMAIL_EXISTS");
  }

  // Create tenant
  const [tenant] = await database
    .insert(tenants)
    .values({
      name: body.name,
      email: body.email,
      plan: "free",
    })
    .returning();

  // Create first API key
  const key = generateApiKey();
  await database.insert(apiKeys).values({
    tenantId: tenant.id,
    key,
    name: "Default Key",
  });

  return c.json(
    {
      tenantId: tenant.id,
      apiKey: key,
      plan: "free",
      message: "Welcome to Connect1! Save your API key — it won't be shown again.",
    },
    201
  );
});

// --- Protected: API Key Management ---

tenantProtectedRoutes.get("/api-keys", async (c) => {
  const tenantId = c.get("tenantId");
  const database = getDb();

  const keys = await database
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.key,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId));

  // Mask keys — only show first 12 chars
  const masked = keys.map((k) => ({
    ...k,
    keyPrefix: k.keyPrefix.slice(0, 12) + "..." + k.keyPrefix.slice(-4),
  }));

  return c.json({ apiKeys: masked });
});

tenantProtectedRoutes.post("/api-keys", async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json<{ name: string }>();

  if (!body.name) {
    throw badRequest("name is required");
  }

  const database = getDb();
  const key = generateApiKey();

  const [apiKey] = await database
    .insert(apiKeys)
    .values({
      tenantId,
      key,
      name: body.name,
    })
    .returning();

  return c.json(
    {
      id: apiKey.id,
      name: apiKey.name,
      key,
      message: "Save your API key — it won't be shown again.",
    },
    201
  );
});

tenantProtectedRoutes.delete("/api-keys/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const database = getDb();

  // Don't allow deleting the last active key
  const activeKeys = await database
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.isActive, true)));

  if (activeKeys.length <= 1) {
    throw badRequest("Cannot delete your last active API key");
  }

  await database
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId)));

  return c.json({ success: true });
});

// --- Protected: Tenant Info ---

tenantProtectedRoutes.get("/me", async (c) => {
  const tenant = c.get("tenant");
  return c.json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    plan: tenant.plan,
  });
});
