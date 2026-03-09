import { Hono } from "hono";
import { getConnectionContext } from "../lib/credentials.js";
import { badRequest } from "../lib/errors.js";
import type { AppEnv } from "../types.js";
import type { GmailConnector } from "@connect1/connector-gmail";

export const emailRoutes = new Hono<AppEnv>();

emailRoutes.get("/:connectionId/messages", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const cursor = c.req.query("cursor");
  const limit = Number(c.req.query("limit")) || 20;

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("listEmails" in connector)) throw badRequest("This connection does not support email");
  const emailConnector = connector as unknown as GmailConnector;
  const result = await emailConnector.listEmails(credentials, { cursor, limit });
  return c.json(result);
});

emailRoutes.get("/:connectionId/messages/:messageId", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const messageId = c.req.param("messageId");

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("getMessage" in connector)) throw badRequest("This connection does not support email");
  const emailConnector = connector as unknown as GmailConnector;
  const email = await emailConnector.getMessage(credentials, messageId);
  return c.json(email);
});

emailRoutes.post("/:connectionId/send", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const body = await c.req.json();

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("sendEmail" in connector)) throw badRequest("This connection does not support email");
  const emailConnector = connector as unknown as GmailConnector;
  const id = await emailConnector.sendEmail(credentials, body);
  return c.json({ id });
});
