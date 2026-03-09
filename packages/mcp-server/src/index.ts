#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Connect1 } from "connect1";

const client = new Connect1({
  apiKey: process.env.CONNECT1_API_KEY ?? "",
  baseUrl: process.env.CONNECT1_API_URL ?? "http://localhost:3100",
});

const server = new McpServer({
  name: "connect1",
  version: "0.1.0",
});

// --- Email Tools ---

server.tool(
  "list_emails",
  "List emails from a connected email account",
  {
    connectionId: z.string().describe("The connection ID for the email provider"),
    limit: z.number().optional().describe("Max emails to return (default 20)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async ({ connectionId, limit, cursor }) => {
    const result = await client.email.list(connectionId, { limit, cursor });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_email",
  "Get a specific email by ID",
  {
    connectionId: z.string(),
    messageId: z.string().describe("The email message ID"),
  },
  async ({ connectionId, messageId }) => {
    const email = await client.email.get(connectionId, messageId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(email, null, 2) }],
    };
  }
);

server.tool(
  "send_email",
  "Send an email through a connected email account",
  {
    connectionId: z.string(),
    to: z.array(z.object({ email: z.string(), name: z.string().optional() })),
    subject: z.string(),
    body: z.string(),
    replyToMessageId: z.string().optional(),
  },
  async ({ connectionId, to, subject, body, replyToMessageId }) => {
    const result = await client.email.send(connectionId, {
      to,
      subject,
      body,
      replyToMessageId,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

// --- Messaging Tools ---

server.tool(
  "list_channels",
  "List messaging channels (Slack, etc.)",
  {
    connectionId: z.string(),
    limit: z.number().optional(),
  },
  async ({ connectionId, limit }) => {
    const result = await client.messaging.channels(connectionId, { limit });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "list_messages",
  "List messages in a channel",
  {
    connectionId: z.string(),
    channelId: z.string(),
    limit: z.number().optional(),
  },
  async ({ connectionId, channelId, limit }) => {
    const result = await client.messaging.messages(connectionId, channelId, {
      limit,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "send_message",
  "Send a message to a channel",
  {
    connectionId: z.string(),
    channelId: z.string(),
    content: z.string(),
    threadId: z.string().optional(),
  },
  async ({ connectionId, channelId, content, threadId }) => {
    const result = await client.messaging.send(connectionId, {
      channelId,
      content,
      threadId,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

// --- File Tools ---

server.tool(
  "list_files",
  "List files from a connected storage provider (Google Drive, etc.)",
  {
    connectionId: z.string(),
    folderId: z.string().optional().describe("Folder ID to list files from"),
    limit: z.number().optional(),
  },
  async ({ connectionId, folderId, limit }) => {
    const result = await client.files.list(connectionId, folderId, { limit });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "get_file",
  "Get metadata for a specific file",
  {
    connectionId: z.string(),
    fileId: z.string(),
  },
  async ({ connectionId, fileId }) => {
    const file = await client.files.get(connectionId, fileId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(file, null, 2) }],
    };
  }
);

// --- Calendar Tools ---

server.tool(
  "list_calendar_events",
  "List upcoming calendar events from a connected calendar (Google Calendar, etc.)",
  {
    connectionId: z.string().describe("The connection ID for the calendar provider"),
    limit: z.number().optional().describe("Max events to return (default 20)"),
    cursor: z.string().optional().describe("Pagination cursor"),
    calendarId: z.string().optional().describe("Calendar ID (default: primary)"),
    timeMin: z.string().optional().describe("Start of time range (ISO 8601)"),
    timeMax: z.string().optional().describe("End of time range (ISO 8601)"),
  },
  async ({ connectionId, limit, cursor, calendarId, timeMin, timeMax }) => {
    const query = new URLSearchParams();
    if (limit) query.set("limit", String(limit));
    if (cursor) query.set("cursor", cursor);
    if (calendarId) query.set("calendarId", calendarId);
    if (timeMin) query.set("timeMin", timeMin);
    if (timeMax) query.set("timeMax", timeMax);
    const result = await client.calendar.events(connectionId, { limit, cursor });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "get_calendar_event",
  "Get a specific calendar event by ID",
  {
    connectionId: z.string(),
    eventId: z.string().describe("The calendar event ID"),
    calendarId: z.string().optional().describe("Calendar ID (default: primary)"),
  },
  async ({ connectionId, eventId }) => {
    const event = await client.calendar.get(connectionId, eventId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(event, null, 2) }],
    };
  }
);

server.tool(
  "create_calendar_event",
  "Create a new calendar event",
  {
    connectionId: z.string(),
    title: z.string().describe("Event title"),
    startTime: z.string().describe("Start time (ISO 8601)"),
    endTime: z.string().describe("End time (ISO 8601)"),
    description: z.string().optional(),
    location: z.string().optional(),
    isAllDay: z.boolean().optional(),
    attendees: z.array(z.object({
      email: z.string(),
      name: z.string().optional(),
    })).optional(),
  },
  async ({ connectionId, title, startTime, endTime, description, location, isAllDay, attendees }) => {
    const result = await client.calendar.create(connectionId, {
      title,
      startTime,
      endTime,
      description,
      location,
      isAllDay,
      attendees,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

// --- Connection Tools ---

server.tool(
  "list_connections",
  "List all active connections for a user",
  {
    userId: z.string(),
  },
  async ({ userId }) => {
    const result = await client.listConnections(userId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Connect1 MCP server running on stdio");
}

main().catch(console.error);
