import type {
  Email,
  SendEmail,
  Channel,
  Message,
  SendMessage,
  File,
  UploadFile,
  Task,
  CreateTask,
  CrmContact,
  CreateCrmContact,
  Deal,
  CalendarEvent,
  CreateCalendarEvent,
} from "./domains/index.js";
import type { PaginationParams, PaginatedResult } from "./connector.js";

export type Connect1Config = {
  apiKey: string;
  baseUrl?: string;
};

const DEFAULT_BASE_URL = "http://localhost:3100";

export class Connect1 {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: Connect1Config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Connect1Error(
        (error as { message?: string }).message ?? "Request failed",
        response.status
      );
    }

    return response.json() as Promise<T>;
  }

  // --- Connection Management ---

  async connect(provider: string, userId: string) {
    return this.request<{ url: string }>("/v1/auth/connect", {
      method: "POST",
      body: JSON.stringify({ provider, userId }),
    });
  }

  async listConnections(userId: string) {
    return this.request<{ connections: ConnectionInfo[] }>(
      `/v1/connections?userId=${encodeURIComponent(userId)}`
    );
  }

  async disconnect(connectionId: string) {
    return this.request<{ success: boolean }>(
      `/v1/connections/${connectionId}`,
      { method: "DELETE" }
    );
  }

  // --- Email ---

  email = {
    list: (connectionId: string, params?: PaginationParams) =>
      this.request<PaginatedResult<Email>>(
        `/v1/email/${connectionId}/messages?${paginationQuery(params)}`
      ),

    get: (connectionId: string, messageId: string) =>
      this.request<Email>(
        `/v1/email/${connectionId}/messages/${messageId}`
      ),

    send: (connectionId: string, email: SendEmail) =>
      this.request<{ id: string }>(`/v1/email/${connectionId}/send`, {
        method: "POST",
        body: JSON.stringify(email),
      }),
  };

  // --- Messaging ---

  messaging = {
    channels: (connectionId: string, params?: PaginationParams) =>
      this.request<PaginatedResult<Channel>>(
        `/v1/messaging/${connectionId}/channels?${paginationQuery(params)}`
      ),

    messages: (
      connectionId: string,
      channelId: string,
      params?: PaginationParams
    ) =>
      this.request<PaginatedResult<Message>>(
        `/v1/messaging/${connectionId}/channels/${channelId}/messages?${paginationQuery(params)}`
      ),

    send: (connectionId: string, message: SendMessage) =>
      this.request<{ id: string }>(
        `/v1/messaging/${connectionId}/send`,
        { method: "POST", body: JSON.stringify(message) }
      ),
  };

  // --- Files ---

  files = {
    list: (connectionId: string, folderId?: string, params?: PaginationParams) =>
      this.request<PaginatedResult<File>>(
        `/v1/files/${connectionId}/list?${folderId ? `folderId=${folderId}&` : ""}${paginationQuery(params)}`
      ),

    get: (connectionId: string, fileId: string) =>
      this.request<File>(`/v1/files/${connectionId}/${fileId}`),

    upload: (connectionId: string, file: UploadFile) =>
      this.request<{ id: string }>(`/v1/files/${connectionId}/upload`, {
        method: "POST",
        body: JSON.stringify(file),
      }),

    delete: (connectionId: string, fileId: string) =>
      this.request<{ success: boolean }>(
        `/v1/files/${connectionId}/${fileId}`,
        { method: "DELETE" }
      ),
  };

  // --- Tasks ---

  tasks = {
    list: (connectionId: string, params?: PaginationParams) =>
      this.request<PaginatedResult<Task>>(
        `/v1/tasks/${connectionId}?${paginationQuery(params)}`
      ),

    get: (connectionId: string, taskId: string) =>
      this.request<Task>(`/v1/tasks/${connectionId}/${taskId}`),

    create: (connectionId: string, task: CreateTask) =>
      this.request<{ id: string }>(`/v1/tasks/${connectionId}`, {
        method: "POST",
        body: JSON.stringify(task),
      }),

    update: (connectionId: string, taskId: string, task: Partial<CreateTask>) =>
      this.request<Task>(`/v1/tasks/${connectionId}/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(task),
      }),
  };

  // --- CRM ---

  crm = {
    contacts: {
      list: (connectionId: string, params?: PaginationParams) =>
        this.request<PaginatedResult<CrmContact>>(
          `/v1/crm/${connectionId}/contacts?${paginationQuery(params)}`
        ),

      get: (connectionId: string, contactId: string) =>
        this.request<CrmContact>(
          `/v1/crm/${connectionId}/contacts/${contactId}`
        ),

      create: (connectionId: string, contact: CreateCrmContact) =>
        this.request<{ id: string }>(
          `/v1/crm/${connectionId}/contacts`,
          { method: "POST", body: JSON.stringify(contact) }
        ),
    },

    deals: {
      list: (connectionId: string, params?: PaginationParams) =>
        this.request<PaginatedResult<Deal>>(
          `/v1/crm/${connectionId}/deals?${paginationQuery(params)}`
        ),
    },
  };

  // --- Calendar ---

  calendar = {
    events: (
      connectionId: string,
      params?: PaginationParams & {
        calendarId?: string;
        timeMin?: string;
        timeMax?: string;
      }
    ) => {
      const q = new URLSearchParams();
      if (params?.cursor) q.set("cursor", params.cursor);
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.calendarId) q.set("calendarId", params.calendarId);
      if (params?.timeMin) q.set("timeMin", params.timeMin);
      if (params?.timeMax) q.set("timeMax", params.timeMax);
      return this.request<PaginatedResult<CalendarEvent>>(
        `/v1/calendar/${connectionId}/events?${q}`
      );
    },

    get: (connectionId: string, eventId: string, calendarId?: string) =>
      this.request<CalendarEvent>(
        `/v1/calendar/${connectionId}/events/${eventId}${calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : ""}`
      ),

    create: (connectionId: string, event: CreateCalendarEvent, calendarId?: string) =>
      this.request<{ id: string }>(
        `/v1/calendar/${connectionId}/events${calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : ""}`,
        { method: "POST", body: JSON.stringify(event) }
      ),
  };

  // --- OAuth App Management ---

  oauthApps = {
    register: (provider: string, clientId: string, clientSecret: string, scopes?: string[], redirectUri?: string) =>
      this.request<{ id: string }>("/v1/auth/oauth-apps", {
        method: "POST",
        body: JSON.stringify({ provider, clientId, clientSecret, scopes, redirectUri }),
      }),

    list: () =>
      this.request<{ apps: Array<{ id: string; provider: string; createdAt: string }> }>(
        "/v1/auth/oauth-apps"
      ),
  };

  // --- Tenant ---

  tenant = {
    me: () => this.request<{ id: string; name: string; email: string; plan: string }>("/v1/tenant/me"),

    apiKeys: {
      list: () =>
        this.request<{ keys: Array<{ id: string; key: string; createdAt: string }> }>(
          "/v1/tenant/api-keys"
        ),

      create: (name?: string) =>
        this.request<{ id: string; key: string }>("/v1/tenant/api-keys", {
          method: "POST",
          body: JSON.stringify({ name }),
        }),

      revoke: (keyId: string) =>
        this.request<{ success: boolean }>(`/v1/tenant/api-keys/${keyId}`, {
          method: "DELETE",
        }),
    },
  };
}

// --- Helpers ---

function paginationQuery(params?: PaginationParams): string {
  const parts: string[] = [];
  if (params?.cursor) parts.push(`cursor=${encodeURIComponent(params.cursor)}`);
  if (params?.limit) parts.push(`limit=${params.limit}`);
  return parts.join("&");
}

export class Connect1Error extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "Connect1Error";
  }
}

export type ConnectionInfo = {
  id: string;
  provider: string;
  userId: string;
  status: "active" | "expired" | "revoked";
  domains: string[];
  createdAt: string;
};
