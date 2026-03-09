export { Connect1, Connect1Error } from "./client.js";
export type { Connect1Config, ConnectionInfo } from "./client.js";

export {
  BaseConnector,
} from "./connector.js";
export type {
  ConnectorConfig,
  ConnectorDomain,
  AuthType,
  OAuthConfig,
  OAuthEndpoints,
  OAuthClientCredentials,
  ConnectionCredentials,
  PaginationParams,
  PaginatedResult,
  ConnectorEvent,
} from "./connector.js";

export { encrypt, decrypt } from "./encryption.js";

export * from "./domains/index.js";
