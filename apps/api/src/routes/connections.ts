import { Hono } from "hono";
import { createDb, connections } from "@connect1/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const connectionsRoutes = new Hono<AppEnv>();

let db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!db) db = createDb(process.env.DATABASE_URL!);
  return db;
}

connectionsRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.req.query("userId");

  const database = getDb();
  const where = userId
    ? and(eq(connections.tenantId, tenantId), eq(connections.userId, userId))
    : eq(connections.tenantId, tenantId);

  const results = await database
    .select({
      id: connections.id,
      userId: connections.userId,
      provider: connections.provider,
      status: connections.status,
      scopes: connections.scopes,
      providerEmail: connections.providerEmail,
      lastSyncAt: connections.lastSyncAt,
      createdAt: connections.createdAt,
    })
    .from(connections)
    .where(where);

  return c.json({ connections: results });
});

connectionsRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const database = getDb();

  const [conn] = await database
    .select({
      id: connections.id,
      userId: connections.userId,
      provider: connections.provider,
      status: connections.status,
      scopes: connections.scopes,
      providerEmail: connections.providerEmail,
      lastSyncAt: connections.lastSyncAt,
      createdAt: connections.createdAt,
    })
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.tenantId, tenantId)))
    .limit(1);

  if (!conn) throw notFound("Connection not found");
  return c.json(conn);
});

connectionsRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const database = getDb();

  await database
    .delete(connections)
    .where(and(eq(connections.id, id), eq(connections.tenantId, tenantId)));

  return c.json({ success: true });
});
