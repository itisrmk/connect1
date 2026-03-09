import {
  BaseConnector,
  type ConnectorConfig,
  type ConnectionCredentials,
  type PaginationParams,
  type PaginatedResult,
  type Task,
  type CreateTask,
} from "connect1";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionConnector extends BaseConnector {
  config: ConnectorConfig = {
    id: "notion",
    name: "Notion",
    domains: ["tasks", "files"],
    authType: "oauth2",
    baseUrl: NOTION_API,
    oauth: {
      authUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      defaultScopes: [],
    },
    description: "Notion workspace integration",
  };

  private headers(credentials: ConnectionCredentials) {
    return {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };
  }

  async testConnection(credentials: ConnectionCredentials): Promise<boolean> {
    const res = await fetch(`${NOTION_API}/users/me`, {
      headers: this.headers(credentials),
    });
    return res.ok;
  }

  async searchPages(
    credentials: ConnectionCredentials,
    query: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<NotionPage>> {
    const body: Record<string, unknown> = {
      query,
      page_size: params?.limit ?? 20,
    };
    if (params?.cursor) body.start_cursor = params.cursor;

    const res = await fetch(`${NOTION_API}/search`, {
      method: "POST",
      headers: this.headers(credentials),
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Notion search failed: ${res.status}`);
    const data = (await res.json()) as NotionSearchResponse;

    return {
      data: data.results as NotionPage[],
      nextCursor: data.next_cursor ?? undefined,
      hasMore: data.has_more,
    };
  }

  async queryDatabase(
    credentials: ConnectionCredentials,
    databaseId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Task>> {
    const body: Record<string, unknown> = {
      page_size: params?.limit ?? 20,
    };
    if (params?.cursor) body.start_cursor = params.cursor;

    const res = await fetch(
      `${NOTION_API}/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: this.headers(credentials),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) throw new Error(`Notion query failed: ${res.status}`);
    const data = (await res.json()) as NotionQueryResponse;

    const tasks: Task[] = data.results.map((page) =>
      this.normalizeToTask(page)
    );

    return {
      data: tasks,
      nextCursor: data.next_cursor ?? undefined,
      hasMore: data.has_more,
    };
  }

  async createPage(
    credentials: ConnectionCredentials,
    databaseId: string,
    task: CreateTask
  ): Promise<string> {
    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: task.title } }] },
    };

    if (task.status) {
      properties["Status"] = { status: { name: task.status } };
    }

    const res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: this.headers(credentials),
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
        children: task.description
          ? [
              {
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ text: { content: task.description } }],
                },
              },
            ]
          : [],
      }),
    });

    if (!res.ok) throw new Error(`Notion create failed: ${res.status}`);
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  private normalizeToTask(page: NotionPage): Task {
    const props = page.properties ?? {};

    // Try common property names for title
    const titleProp =
      props["Name"] ?? props["Title"] ?? props["name"] ?? props["title"];
    const title =
      titleProp?.title?.[0]?.plain_text ?? titleProp?.rich_text?.[0]?.plain_text ?? "Untitled";

    const statusProp = props["Status"] ?? props["status"];
    const status = this.mapNotionStatus(
      statusProp?.status?.name ?? statusProp?.select?.name
    );

    return {
      id: page.id,
      provider: "notion",
      title,
      status,
      createdAt: page.created_time,
      updatedAt: page.last_edited_time,
      url: page.url,
      raw: page as unknown as Record<string, unknown>,
    };
  }

  private mapNotionStatus(
    status?: string
  ): "todo" | "in_progress" | "done" | "cancelled" {
    if (!status) return "todo";
    const lower = status.toLowerCase();
    if (lower.includes("done") || lower.includes("complete")) return "done";
    if (lower.includes("progress") || lower.includes("doing")) return "in_progress";
    if (lower.includes("cancel")) return "cancelled";
    return "todo";
  }
}

// --- Notion API types ---

type NotionPage = {
  id: string;
  created_time: string;
  last_edited_time: string;
  url: string;
  properties?: Record<string, NotionProperty>;
};

type NotionProperty = {
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  status?: { name: string };
  select?: { name: string };
};

type NotionSearchResponse = {
  results: unknown[];
  next_cursor: string | null;
  has_more: boolean;
};

type NotionQueryResponse = {
  results: NotionPage[];
  next_cursor: string | null;
  has_more: boolean;
};

export default NotionConnector;
