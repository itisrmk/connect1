import { Hono } from "hono";
import { getConnectionContext } from "../lib/credentials.js";
import { badRequest } from "../lib/errors.js";
import type { AppEnv } from "../types.js";
import type { GoogleCalendarConnector } from "@connect1/connector-google-calendar";

export const calendarRoutes = new Hono<AppEnv>();

calendarRoutes.get("/:connectionId/events", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const cursor = c.req.query("cursor");
  const limit = Number(c.req.query("limit")) || 20;
  const calendarId = c.req.query("calendarId");
  const timeMin = c.req.query("timeMin");
  const timeMax = c.req.query("timeMax");

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("listEvents" in connector)) throw badRequest("This connection does not support calendar");
  const calConnector = connector as unknown as GoogleCalendarConnector;
  const result = await calConnector.listEvents(credentials, {
    cursor,
    limit,
    calendarId: calendarId ?? undefined,
    timeMin: timeMin ?? undefined,
    timeMax: timeMax ?? undefined,
  });
  return c.json(result);
});

calendarRoutes.get("/:connectionId/events/:eventId", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const eventId = c.req.param("eventId");
  const calendarId = c.req.query("calendarId");

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("getEvent" in connector)) throw badRequest("This connection does not support calendar");
  const calConnector = connector as unknown as GoogleCalendarConnector;
  const event = await calConnector.getEvent(credentials, eventId, calendarId ?? undefined);
  return c.json(event);
});

calendarRoutes.post("/:connectionId/events", async (c) => {
  const tenantId = c.get("tenantId");
  const connectionId = c.req.param("connectionId");
  const body = await c.req.json();
  const calendarId = c.req.query("calendarId");

  const { credentials, connector } = await getConnectionContext(connectionId, tenantId);
  if (!("createEvent" in connector)) throw badRequest("This connection does not support calendar");
  const calConnector = connector as unknown as GoogleCalendarConnector;
  const id = await calConnector.createEvent(credentials, body, calendarId ?? undefined);
  return c.json({ id }, 201);
});
