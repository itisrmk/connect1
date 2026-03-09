import {
  BaseConnector,
  type ConnectorConfig,
  type ConnectionCredentials,
  type PaginationParams,
  type PaginatedResult,
  type Channel,
  type Message,
  type SendMessage,
} from "connect1";

const SLACK_API = "https://slack.com/api";

export class SlackConnector extends BaseConnector {
  config: ConnectorConfig = {
    id: "slack",
    name: "Slack",
    domains: ["messaging"],
    authType: "oauth2",
    baseUrl: SLACK_API,
    oauth: {
      authUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      defaultScopes: [
        "channels:read",
        "channels:history",
        "chat:write",
        "users:read",
        "groups:read",
        "groups:history",
      ],
    },
    description: "Slack messaging integration",
  };

  async testConnection(credentials: ConnectionCredentials): Promise<boolean> {
    const res = await fetch(`${SLACK_API}/auth.test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  }

  async listChannels(
    credentials: ConnectionCredentials,
    params?: PaginationParams
  ): Promise<PaginatedResult<Channel>> {
    const query = new URLSearchParams({
      limit: String(params?.limit ?? 20),
      types: "public_channel,private_channel",
    });
    if (params?.cursor) query.set("cursor", params.cursor);

    const res = await fetch(`${SLACK_API}/conversations.list?${query}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });

    const data = (await res.json()) as SlackChannelListResponse;
    if (!data.ok) throw new Error(`Slack channels failed: ${data.error}`);

    const channels: Channel[] = (data.channels ?? []).map((ch) => ({
      id: ch.id,
      provider: "slack",
      name: ch.name,
      description: ch.purpose?.value,
      isPrivate: ch.is_private,
      memberCount: ch.num_members,
      createdAt: new Date(ch.created * 1000).toISOString(),
      raw: ch as unknown as Record<string, unknown>,
    }));

    return {
      data: channels,
      nextCursor: data.response_metadata?.next_cursor || undefined,
      hasMore: !!data.response_metadata?.next_cursor,
    };
  }

  async listMessages(
    credentials: ConnectionCredentials,
    channelId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Message>> {
    const query = new URLSearchParams({
      channel: channelId,
      limit: String(params?.limit ?? 20),
    });
    if (params?.cursor) query.set("cursor", params.cursor);

    const res = await fetch(`${SLACK_API}/conversations.history?${query}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });

    const data = (await res.json()) as SlackMessageListResponse;
    if (!data.ok) throw new Error(`Slack messages failed: ${data.error}`);

    const messages: Message[] = (data.messages ?? []).map((msg) => ({
      id: msg.ts,
      provider: "slack",
      channelId,
      author: {
        id: msg.user ?? "unknown",
        name: msg.user ?? "unknown",
      },
      content: msg.text ?? "",
      timestamp: new Date(Number(msg.ts.split(".")[0]) * 1000).toISOString(),
      threadId: msg.thread_ts,
      raw: msg as unknown as Record<string, unknown>,
    }));

    return {
      data: messages,
      nextCursor: data.response_metadata?.next_cursor || undefined,
      hasMore: data.has_more ?? false,
    };
  }

  async sendMessage(
    credentials: ConnectionCredentials,
    message: SendMessage
  ): Promise<string> {
    const body: Record<string, string> = {
      channel: message.channelId,
      text: message.content,
    };
    if (message.threadId) body.thread_ts = message.threadId;

    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
    if (!data.ok) throw new Error(`Slack send failed: ${data.error}`);
    return data.ts ?? "";
  }
}

// --- Slack API types ---

type SlackChannelListResponse = {
  ok: boolean;
  error?: string;
  channels?: {
    id: string;
    name: string;
    is_private: boolean;
    num_members: number;
    created: number;
    purpose?: { value: string };
  }[];
  response_metadata?: { next_cursor: string };
};

type SlackMessageListResponse = {
  ok: boolean;
  error?: string;
  messages?: {
    ts: string;
    user?: string;
    text?: string;
    thread_ts?: string;
  }[];
  has_more?: boolean;
  response_metadata?: { next_cursor: string };
};

export default SlackConnector;
