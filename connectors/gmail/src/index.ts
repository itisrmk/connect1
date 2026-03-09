import {
  BaseConnector,
  type ConnectorConfig,
  type ConnectionCredentials,
  type PaginationParams,
  type PaginatedResult,
  type Email,
  type SendEmail,
} from "connect1";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export class GmailConnector extends BaseConnector {
  config: ConnectorConfig = {
    id: "gmail",
    name: "Gmail",
    domains: ["email"],
    authType: "oauth2",
    baseUrl: GMAIL_API,
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      defaultScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
    },
    description: "Google Gmail email integration",
  };

  async testConnection(credentials: ConnectionCredentials): Promise<boolean> {
    const res = await fetch(`${GMAIL_API}/users/me/profile`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    return res.ok;
  }

  async listEmails(
    credentials: ConnectionCredentials,
    params?: PaginationParams
  ): Promise<PaginatedResult<Email>> {
    const query = new URLSearchParams({
      maxResults: String(params?.limit ?? 20),
    });
    if (params?.cursor) query.set("pageToken", params.cursor);

    const listRes = await fetch(
      `${GMAIL_API}/users/me/messages?${query}`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );

    if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
    const listData = (await listRes.json()) as GmailListResponse;

    if (!listData.messages?.length) {
      return { data: [], hasMore: false };
    }

    // Fetch full message details in parallel (batch of 10)
    const messages = await Promise.all(
      listData.messages.slice(0, 10).map((m) =>
        this.getMessage(credentials, m.id)
      )
    );

    return {
      data: messages,
      nextCursor: listData.nextPageToken,
      hasMore: !!listData.nextPageToken,
    };
  }

  async getMessage(
    credentials: ConnectionCredentials,
    messageId: string
  ): Promise<Email> {
    const res = await fetch(
      `${GMAIL_API}/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );

    if (!res.ok) throw new Error(`Gmail get message failed: ${res.status}`);
    const data = (await res.json()) as GmailMessage;

    return this.normalizeEmail(data);
  }

  async sendEmail(
    credentials: ConnectionCredentials,
    email: SendEmail
  ): Promise<string> {
    const raw = this.buildRawEmail(email);
    const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) throw new Error(`Gmail send failed: ${res.status}`);
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  private normalizeEmail(msg: GmailMessage): Email {
    const headers = msg.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

    const from = parseEmailAddress(getHeader("From"));
    const to = parseEmailAddresses(getHeader("To"));
    const cc = parseEmailAddresses(getHeader("Cc"));
    const subject = getHeader("Subject");
    const body = extractBody(msg.payload);
    const labels = msg.labelIds ?? [];

    return {
      id: msg.id,
      provider: "gmail",
      from,
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject,
      body,
      threadId: msg.threadId,
      labels,
      isRead: !labels.includes("UNREAD"),
      receivedAt: new Date(Number(msg.internalDate)).toISOString(),
      raw: msg as unknown as Record<string, unknown>,
    };
  }

  private buildRawEmail(email: SendEmail): string {
    const toList = email.to.map((c) => (c.name ? `${c.name} <${c.email}>` : c.email)).join(", ");

    const lines = [
      `To: ${toList}`,
      `Subject: ${email.subject}`,
      `Content-Type: ${email.bodyHtml ? "text/html" : "text/plain"}; charset=utf-8`,
      "",
      email.bodyHtml ?? email.body,
    ];

    if (email.cc?.length) {
      const ccList = email.cc.map((c) => (c.name ? `${c.name} <${c.email}>` : c.email)).join(", ");
      lines.splice(1, 0, `Cc: ${ccList}`);
    }

    // Base64url encode
    return btoa(lines.join("\r\n"))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
}

// --- Gmail API types ---

type GmailListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
};

type GmailHeader = { name: string; value: string };

type GmailPart = {
  mimeType: string;
  headers?: GmailHeader[];
  body?: { data?: string; size: number };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
};

// --- Helpers ---

function parseEmailAddress(raw: string): { name?: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2] };
  return { email: raw.trim() };
}

function parseEmailAddresses(raw: string): { name?: string; email: string }[] {
  if (!raw) return [];
  return raw.split(",").map((s) => parseEmailAddress(s.trim()));
}

function extractBody(payload?: GmailPart): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    // Prefer text/plain, fallback to text/html
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, "base64url").toString("utf-8");
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }

  return "";
}

export default GmailConnector;
