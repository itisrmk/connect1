import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authPublicRoutes, authProtectedRoutes } from "./routes/auth.js";
import { emailRoutes } from "./routes/email.js";
import { messagingRoutes } from "./routes/messaging.js";
import { filesRoutes } from "./routes/files.js";
import { calendarRoutes } from "./routes/calendar.js";
import { connectionsRoutes } from "./routes/connections.js";
import { tenantPublicRoutes, tenantProtectedRoutes } from "./routes/tenant.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { errorHandler } from "./middleware/error-handler.js";
import type { AppEnv } from "./types.js";

const app = new Hono();

// Global middleware
app.use("*", cors());
app.use("*", logger());

// Global error handler
app.onError(errorHandler);

// Health check
app.get("/", (c) =>
  c.json({
    name: "Connect1 API",
    version: "0.1.0",
    description: "Universal connector layer for AI products",
    docs: "https://github.com/connect1-dev/connect1",
  })
);

app.get("/health", (c) => c.json({ status: "ok" }));

// ==========================================
// DEVELOPER CONSOLE (no API key, served as HTML)
// ==========================================
app.route("/console", dashboardRoutes);

// ==========================================
// PUBLIC ROUTES (no auth required)
// ==========================================
app.route("/v1/auth", authPublicRoutes);
app.route("/v1", tenantPublicRoutes);

// ==========================================
// PROTECTED ROUTES (API key required)
// ==========================================
const api = new Hono<AppEnv>();
api.use("*", authMiddleware);
api.use("*", rateLimitMiddleware);

// Auth management (BYOO OAuth, connect)
api.route("/auth", authProtectedRoutes);

// Tenant management
api.route("/tenant", tenantProtectedRoutes);

// Domain routes
api.route("/connections", connectionsRoutes);
api.route("/email", emailRoutes);
api.route("/messaging", messagingRoutes);
api.route("/files", filesRoutes);
api.route("/calendar", calendarRoutes);

app.route("/v1", api);

// Start server
const port = Number(process.env.PORT) || 3100;
console.log(`Connect1 API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;
