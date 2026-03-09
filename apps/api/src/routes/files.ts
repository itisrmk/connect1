import { Hono } from "hono";
import { getConnectionContext } from "../lib/credentials.js";
import { badRequest } from "../lib/errors.js";
import type { AppEnv } from "../types.js";
import type { GoogleDriveConnector } from "@connect1/connector-google-drive";

export const filesRoutes = new Hono<AppEnv>();

filesRoutes.get("/:connectionId/list", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const folderId = c.req.query("folderId");
  const cursor = c.req.query("cursor");
  const limit = Number(c.req.query("limit")) || 20;

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("listFiles" in connector)) throw badRequest("This connection does not support files");
  const filesConnector = connector as unknown as GoogleDriveConnector;
  const result = await filesConnector.listFiles(credentials, folderId, { cursor, limit });
  return c.json(result);
});

filesRoutes.get("/:connectionId/:fileId", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const fileId = c.req.param("fileId");

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("getFile" in connector)) throw badRequest("This connection does not support files");
  const filesConnector = connector as unknown as GoogleDriveConnector;
  const file = await filesConnector.getFile(credentials, fileId);
  return c.json(file);
});
