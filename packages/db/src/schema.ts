import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  jsonb,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";

// API keys for tenant authentication
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  scopes: jsonb("scopes").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tenants — the AI companies using Connect1
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  plan: varchar("plan", { length: 50 }).default("free").notNull(),
  apiCallCount: integer("api_call_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// OAuth Apps — tenant-owned OAuth credentials (Bring Your Own OAuth)
export const oauthApps = pgTable(
  "oauth_apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    // Encrypted client credentials
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret").notNull(),
    scopes: jsonb("scopes").$type<string[]>().default([]),
    redirectUri: text("redirect_uri"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("oauth_apps_tenant_provider_idx").on(table.tenantId, table.provider),
  ]
);

// Connections — a user's authenticated link to a provider
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 })
      .default("active")
      .notNull(),
    // Encrypted OAuth credentials
    credentials: text("credentials").notNull(),
    scopes: jsonb("scopes").$type<string[]>().default([]),
    providerAccountId: varchar("provider_account_id", { length: 255 }),
    providerEmail: varchar("provider_email", { length: 255 }),
    tokenExpiresAt: timestamp("token_expires_at"),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("connections_tenant_user_idx").on(table.tenantId, table.userId),
    index("connections_provider_idx").on(table.provider),
  ]
);

// OAuth state — temporary storage for OAuth flow
export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: varchar("state", { length: 128 }).notNull().unique(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  redirectUrl: text("redirect_url"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Webhook subscriptions
export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().default([]),
  secret: varchar("secret", { length: 128 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Event log — audit trail of all connector events
export const eventLog = pgTable(
  "event_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 50 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("event_log_tenant_idx").on(table.tenantId),
    index("event_log_connection_idx").on(table.connectionId),
  ]
);
