import { Hono } from "hono";
import { html, raw } from "hono/html";
import { createDb, connections, oauthApps, apiKeys, tenants } from "@connect1/db";
import { count, sql } from "drizzle-orm";
import { listProviders } from "../lib/connectors.js";

const dashboard = new Hono();

let db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!db) db = createDb(process.env.DATABASE_URL!);
  return db;
}

function layout(title: string, content: string) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Connect1</title>
  <script src="https://unpkg.com/htmx.org@1.9.12"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    nav { background: #141414; border-bottom: 1px solid #262626; padding: 1rem 2rem; display: flex; align-items: center; gap: 2rem; }
    nav a { color: #a3a3a3; text-decoration: none; font-size: 0.875rem; }
    nav a:hover { color: #fff; }
    .logo { font-weight: 700; font-size: 1.25rem; color: #fff; }
    .card { background: #141414; border: 1px solid #262626; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1rem; }
    .card h3 { margin-bottom: 0.75rem; font-size: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .stat { text-align: center; }
    .stat .value { font-size: 2.5rem; font-weight: 700; color: #3b82f6; }
    .stat .label { font-size: 0.875rem; color: #737373; margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #262626; }
    th { color: #737373; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { font-size: 0.875rem; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; display: inline-block; }
    .badge-green { background: #052e16; color: #4ade80; }
    .badge-blue { background: #172554; color: #60a5fa; }
    .badge-gray { background: #1c1c1c; color: #a3a3a3; }
    .empty { text-align: center; padding: 3rem; color: #525252; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; }
    code { background: #1c1c1c; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.8rem; }
    .desc { color: #737373; font-size: 0.875rem; margin-bottom: 0.5rem; }
    .meta { margin-top: 0.5rem; font-size: 0.75rem; color: #525252; }
  </style>
</head>
<body>
  <nav>
    <span class="logo">Connect1</span>
    <a href="/console">Dashboard</a>
    <a href="/console/connections">Connections</a>
    <a href="/console/providers">Providers</a>
    <a href="/console/api-keys">API Keys</a>
  </nav>
  <div class="container">
    ${raw(content)}
  </div>
</body>
</html>`;
}

// --- Dashboard Home ---

dashboard.get("/", async (c) => {
  const database = getDb();

  const [tenantCount] = await database.select({ count: count() }).from(tenants);
  const [connectionCount] = await database.select({ count: count() }).from(connections);
  const [oauthAppCount] = await database.select({ count: count() }).from(oauthApps);
  const providers = listProviders();

  return c.html(
    layout("Dashboard", `
      <h1>Dashboard</h1>
      <div class="grid">
        <div class="card stat">
          <div class="value">${tenantCount.count}</div>
          <div class="label">Tenants</div>
        </div>
        <div class="card stat">
          <div class="value">${connectionCount.count}</div>
          <div class="label">Connections</div>
        </div>
        <div class="card stat">
          <div class="value">${oauthAppCount.count}</div>
          <div class="label">OAuth Apps</div>
        </div>
        <div class="card stat">
          <div class="value">${providers.length}</div>
          <div class="label">Providers</div>
        </div>
      </div>
      <div class="card" style="margin-top: 1rem">
        <h3>Recent Connections</h3>
        <div id="recent-connections" hx-get="/console/partials/recent-connections" hx-trigger="load">
          <div class="empty">Loading...</div>
        </div>
      </div>
    `)
  );
});

// --- Connections Page ---

dashboard.get("/connections", async (c) => {
  const database = getDb();

  const conns = await database
    .select({
      id: connections.id,
      userId: connections.userId,
      provider: connections.provider,
      status: connections.status,
      providerEmail: connections.providerEmail,
      createdAt: connections.createdAt,
    })
    .from(connections)
    .orderBy(sql`${connections.createdAt} DESC`)
    .limit(100);

  const rows = conns.length === 0
    ? '<div class="empty">No connections yet. Use the API to create OAuth connections.</div>'
    : `<table>
        <thead><tr><th>Provider</th><th>User ID</th><th>Email</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>${conns.map((conn) => `
          <tr>
            <td><span class="badge badge-blue">${conn.provider}</span></td>
            <td>${conn.userId ?? "—"}</td>
            <td>${conn.providerEmail ?? "—"}</td>
            <td><span class="badge ${conn.status === "active" ? "badge-green" : "badge-gray"}">${conn.status}</span></td>
            <td>${conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;

  return c.html(layout("Connections", `<h1>Connections</h1><div class="card">${rows}</div>`));
});

// --- Providers Page ---

dashboard.get("/providers", async (c) => {
  const providers = listProviders();

  const cards = providers
    .map(
      (p) => `
      <div class="card">
        <h3>${p.name}</h3>
        <p class="desc">${p.description ?? ""}</p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap">
          ${p.domains.map((d) => `<span class="badge badge-blue">${d}</span>`).join("")}
        </div>
        <div class="meta">Auth: ${p.authType} · ID: ${p.id}</div>
      </div>`
    )
    .join("");

  return c.html(layout("Providers", `<h1>Available Providers</h1><div class="grid">${cards}</div>`));
});

// --- API Keys Page ---

dashboard.get("/api-keys", async (c) => {
  const database = getDb();

  const keys = await database
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      key: apiKeys.key,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .orderBy(sql`${apiKeys.createdAt} DESC`)
    .limit(100);

  const rows = keys.length === 0
    ? '<div class="empty">No API keys found.</div>'
    : `<table>
        <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Last Used</th><th>Created</th></tr></thead>
        <tbody>${keys.map((key) => `
          <tr>
            <td>${key.name ?? "Default"}</td>
            <td><code>${key.key.slice(0, 12)}•••</code></td>
            <td>${key.scopes ? (key.scopes as string[]).join(", ") : '<span style="color:#525252">all</span>'}</td>
            <td>${key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}</td>
            <td>${key.createdAt ? new Date(key.createdAt).toLocaleDateString() : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;

  return c.html(layout("API Keys", `<h1>API Keys</h1><div class="card">${rows}</div>`));
});

// --- HTMX Partials ---

dashboard.get("/partials/recent-connections", async (c) => {
  const database = getDb();

  const conns = await database
    .select({
      id: connections.id,
      provider: connections.provider,
      status: connections.status,
      providerEmail: connections.providerEmail,
      createdAt: connections.createdAt,
    })
    .from(connections)
    .orderBy(sql`${connections.createdAt} DESC`)
    .limit(5);

  if (conns.length === 0) {
    return c.html('<div class="empty">No connections yet</div>');
  }

  return c.html(`
    <table>
      <thead><tr><th>Provider</th><th>Email</th><th>Status</th><th>Created</th></tr></thead>
      <tbody>${conns.map((conn) => `
        <tr>
          <td><span class="badge badge-blue">${conn.provider}</span></td>
          <td>${conn.providerEmail ?? "—"}</td>
          <td><span class="badge ${conn.status === "active" ? "badge-green" : "badge-gray"}">${conn.status}</span></td>
          <td>${conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : "—"}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  `);
});

export { dashboard as dashboardRoutes };
