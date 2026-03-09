import { z } from "zod";

export type ConnectorDomain =
  | "email"
  | "messaging"
  | "files"
  | "tasks"
  | "crm"
  | "calendar";

export type AuthType = "oauth2" | "api_key" | "basic";

export type OAuthEndpoints = {
  authUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
};

// Runtime OAuth credentials — provided by tenant, not hardcoded
export type OAuthClientCredentials = {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
};

// Legacy compat — full config with embedded credentials
export type OAuthConfig = OAuthEndpoints & OAuthClientCredentials;

export type ConnectorConfig = {
  id: string;
  name: string;
  domains: ConnectorDomain[];
  authType: AuthType;
  oauth?: OAuthEndpoints;
  baseUrl: string;
  icon?: string;
  description?: string;
};

export type ConnectionCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  raw?: Record<string, unknown>;
};

export type PaginationParams = {
  cursor?: string;
  limit?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
};

export type ConnectorEvent = {
  type: string;
  action: "created" | "updated" | "deleted";
  data: unknown;
  timestamp: string;
  connectionId: string;
};

export abstract class BaseConnector {
  abstract config: ConnectorConfig;

  abstract testConnection(credentials: ConnectionCredentials): Promise<boolean>;

  // Build OAuth URL using tenant's own credentials
  getOAuthUrl(
    state: string,
    redirectUri: string,
    clientCredentials: OAuthClientCredentials
  ): string {
    const oauth = this.config.oauth;
    if (!oauth) throw new Error(`${this.config.id} does not support OAuth`);

    const scopes = clientCredentials.scopes ?? oauth.defaultScopes;

    const params = new URLSearchParams({
      client_id: clientCredentials.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state,
      access_type: "offline",
      prompt: "consent",
    });

    return `${oauth.authUrl}?${params.toString()}`;
  }

  // Exchange code using tenant's own credentials
  async exchangeCode(
    code: string,
    redirectUri: string,
    clientCredentials: OAuthClientCredentials
  ): Promise<ConnectionCredentials> {
    const oauth = this.config.oauth;
    if (!oauth) throw new Error(`${this.config.id} does not support OAuth`);

    const response = await fetch(oauth.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientCredentials.clientId,
        client_secret: clientCredentials.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresAt: data.expires_in
        ? Date.now() + (data.expires_in as number) * 1000
        : undefined,
      tokenType: data.token_type as string | undefined,
      scope: data.scope as string | undefined,
    };
  }

  // Refresh using tenant's own credentials
  async refreshAccessToken(
    refreshToken: string,
    clientCredentials: OAuthClientCredentials
  ): Promise<ConnectionCredentials> {
    const oauth = this.config.oauth;
    if (!oauth) throw new Error(`${this.config.id} does not support OAuth`);

    const response = await fetch(oauth.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientCredentials.clientId,
        client_secret: clientCredentials.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
      expiresAt: data.expires_in
        ? Date.now() + (data.expires_in as number) * 1000
        : undefined,
      tokenType: data.token_type as string | undefined,
      scope: data.scope as string | undefined,
    };
  }
}
