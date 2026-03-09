import { Hono } from "hono";
import { getConnectionContext } from "../lib/credentials.js";
import { badRequest } from "../lib/errors.js";
import type { AppEnv } from "../types.js";
import type { SlackConnector } from "@connect1/connector-slack";

export const messagingRoutes = new Hono<AppEnv>();

messagingRoutes.get("/:connectionId/channels", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const cursor = c.req.query("cursor");
  const limit = Number(c.req.query("limit")) || 20;

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("listChannels" in connector)) throw badRequest("This connection does not support messaging");
  const msgConnector = connector as unknown as SlackConnector;
  const result = await msgConnector.listChannels(credentials, { cursor, limit });
  return c.json(result);
});

messagingRoutes.get("/:connectionId/channels/:channelId/messages", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const channelId = c.req.param("channelId");
  const cursor = c.req.query("cursor");
  const limit = Number(c.req.query("limit")) || 20;

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("listMessages" in connector)) throw badRequest("This connection does not support messaging");
  const msgConnector = connector as unknown as SlackConnector;
  const result = await msgConnector.listMessages(credentials, channelId, { cursor, limit });
  return c.json(result);
});

messagingRoutes.post("/:connectionId/send", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const body = await c.req.json();

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("sendMessage" in connector)) throw badRequest("This connection does not support messaging");
  const msgConnector = connector as unknown as SlackConnector;
  const id = await msgConnector.sendMessage(credentials, body);
  return c.json({ id });
});
