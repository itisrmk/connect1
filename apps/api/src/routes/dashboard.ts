import { Hono } from "hono";
import { createDb, connections, oauthApps, apiKeys, tenants } from "@connect1/db";
import { eq, and, count, sql } from "drizzle-orm";
import { decrypt } from "connect1";
import { getConnector, listProviders } from "../lib/connectors.js";

type DashboardEnv = {
  Variables: {
    tenantId: string;
    tenantName: string;
    tenantEmail: string;
    plan: string;
  };
};

const dashboard = new Hono<DashboardEnv>();

let db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!db) db = createDb(process.env.DATABASE_URL!);
  return db;
}

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY not set");
  return key;
}

// Authenticate dashboard requests via cookie or header
async function getDashboardTenant(c: any): Promise<{ tenantId: string; tenantName: string; tenantEmail: string; plan: string } | null> {
  const apiKey = c.req.header("X-API-Key") || getCookie(c, "connect1_key");
  if (!apiKey) return null;

  const database = getDb();
  const [key] = await database
    .select({ tenantId: apiKeys.tenantId })
    .from(apiKeys)
    .where(and(eq(apiKeys.key, apiKey), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!key) return null;

  const [tenant] = await database
    .select({ id: tenants.id, name: tenants.name, email: tenants.email, plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, key.tenantId))
    .limit(1);

  if (!tenant) return null;
  return { tenantId: tenant.id, tenantName: tenant.name, tenantEmail: tenant.email, plan: tenant.plan };
}

function getCookie(c: any, name: string): string | undefined {
  const cookies = c.req.header("cookie") ?? "";
  const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// ===================== STYLES =====================

const STYLES = `
:root { --bg: #09090b; --surface: #18181b; --surface2: #27272a; --border: #3f3f46; --text: #fafafa; --text2: #a1a1aa; --text3: #71717a; --blue: #3b82f6; --blue2: #1d4ed8; --green: #22c55e; --red: #ef4444; --yellow: #eab308; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: var(--bg); color: var(--text); font-size: 14px; }
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Layout */
.layout { display: flex; min-height: 100vh; }
.sidebar { width: 240px; background: var(--surface); border-right: 1px solid var(--border); padding: 1rem 0; display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; }
.sidebar-header { padding: 0.5rem 1.25rem 1.5rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
.sidebar-header h1 { font-size: 1.1rem; font-weight: 700; }
.sidebar-header .env { font-size: 0.7rem; color: var(--text3); margin-top: 2px; }
.sidebar nav a { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1.25rem; color: var(--text2); font-size: 0.85rem; text-decoration: none; transition: all 0.1s; }
.sidebar nav a:hover { color: var(--text); background: var(--surface2); }
.sidebar nav a.active { color: var(--text); background: var(--surface2); border-right: 2px solid var(--blue); }
.sidebar-footer { margin-top: auto; padding: 1rem 1.25rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--text3); }
.main { margin-left: 240px; flex: 1; padding: 2rem 2.5rem; max-width: 1100px; }
.page-header { margin-bottom: 1.5rem; }
.page-header h2 { font-size: 1.25rem; font-weight: 600; }
.page-header p { color: var(--text3); font-size: 0.85rem; margin-top: 0.25rem; }

/* Cards & Tables */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; margin-bottom: 1rem; }
.card-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.card-header h3 { font-size: 0.9rem; font-weight: 600; }
.card-body { padding: 1.25rem; }
.card-empty { padding: 3rem; text-align: center; color: var(--text3); }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 0.6rem 1rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text3); border-bottom: 1px solid var(--border); }
td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
tr:last-child td { border-bottom: none; }

/* Badges */
.badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 500; }
.badge-green { background: #052e16; color: #4ade80; }
.badge-blue { background: #172554; color: #60a5fa; }
.badge-gray { background: var(--surface2); color: var(--text3); }
.badge-yellow { background: #422006; color: #facc15; }

/* Stats Grid */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem; }
.stat-card .label { font-size: 0.75rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.05em; }
.stat-card .value { font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem; }

/* Forms */
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--text2); margin-bottom: 0.35rem; }
.form-group input, .form-group select, .form-group textarea { width: 100%; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text); font-size: 0.85rem; font-family: inherit; }
.form-group input:focus, .form-group select:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue); }
.form-group input::placeholder { color: var(--text3); }

/* Buttons */
.btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 1rem; border-radius: 0.375rem; font-size: 0.8rem; font-weight: 500; border: none; cursor: pointer; font-family: inherit; transition: all 0.1s; }
.btn-primary { background: var(--blue); color: white; }
.btn-primary:hover { background: var(--blue2); }
.btn-danger { background: var(--red); color: white; }
.btn-danger:hover { opacity: 0.9; }
.btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text2); }
.btn-outline:hover { background: var(--surface2); color: var(--text); }
.btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }

/* Tabs */
.tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; }
.tab { padding: 0.6rem 1.25rem; font-size: 0.85rem; color: var(--text3); border-bottom: 2px solid transparent; cursor: pointer; text-decoration: none; }
.tab:hover { color: var(--text); text-decoration: none; }
.tab.active { color: var(--text); border-bottom-color: var(--blue); }

/* Provider grid */
.provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; }
.provider-card { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem; cursor: pointer; transition: border-color 0.1s; }
.provider-card:hover { border-color: var(--blue); }
.provider-card.configured { border-color: var(--green); }
.provider-card h4 { font-size: 0.9rem; margin-bottom: 0.25rem; }
.provider-card .domains { margin-top: 0.5rem; }
.provider-card .status { margin-top: 0.5rem; font-size: 0.75rem; }

/* Toast */
.toast { position: fixed; top: 1rem; right: 1rem; padding: 0.75rem 1.25rem; border-radius: 0.5rem; font-size: 0.85rem; z-index: 100; animation: fadeIn 0.2s; }
.toast-success { background: #052e16; color: #4ade80; border: 1px solid #166534; }
.toast-error { background: #450a0a; color: #fca5a5; border: 1px solid #991b1b; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

/* Login */
.login-container { max-width: 420px; margin: 10vh auto; padding: 2rem; }
.login-container h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.login-container p { color: var(--text3); margin-bottom: 2rem; font-size: 0.9rem; }

/* Code block */
code { background: var(--bg); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.8rem; font-family: "SF Mono", Monaco, monospace; }
.code-block { background: var(--bg); border: 1px solid var(--border); border-radius: 0.375rem; padding: 1rem; font-family: "SF Mono", Monaco, monospace; font-size: 0.8rem; overflow-x: auto; white-space: pre; }

/* Alert */
.alert { padding: 0.75rem 1rem; border-radius: 0.375rem; font-size: 0.85rem; margin-bottom: 1rem; }
.alert-info { background: #172554; color: #93c5fd; border: 1px solid #1e40af; }
.alert-success { background: #052e16; color: #86efac; border: 1px solid #166534; }
`;

function page(title: string, activePage: string, content: string, tenantName?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Connect1</title>
  <script src="https://unpkg.com/htmx.org@1.9.12"></script>
  <script src="https://unpkg.com/htmx-ext-json-enc@2.0.1/json-enc.js"></script>
  <style>${STYLES}</style>
</head>
<body>
  <div class="layout">
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>Connect1</h1>
        <div class="env">Production</div>
      </div>
      <nav>
        <a href="/console" class="${activePage === "home" ? "active" : ""}">Dashboard</a>
        <a href="/console/integrations" class="${activePage === "integrations" ? "active" : ""}">Integrations</a>
        <a href="/console/connections" class="${activePage === "connections" ? "active" : ""}">Connections</a>
        <a href="/console/api-keys" class="${activePage === "api-keys" ? "active" : ""}">API Keys</a>
        <a href="/console/settings" class="${activePage === "settings" ? "active" : ""}">Settings</a>
      </nav>
      <div class="sidebar-footer">
        ${tenantName ? `${tenantName}<br>` : ""}
        <a href="/console/logout" style="color:var(--text3)">Sign out</a>
      </div>
    </div>
    <div class="main">${content}</div>
  </div>
  <script>
    document.body.addEventListener('htmx:afterRequest', function(e) {
      if (e.detail.successful && e.detail.xhr.status < 300) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        toast.textContent = 'Saved successfully';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
    });
    document.body.addEventListener('htmx:responseError', function(e) {
      const toast = document.createElement('div');
      toast.className = 'toast toast-error';
      try { toast.textContent = JSON.parse(e.detail.xhr.responseText).error.message; } catch { toast.textContent = 'Something went wrong'; }
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    });
  </script>
</body>
</html>`;
}

function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in — Connect1</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="login-container">
    <h1>Connect1</h1>
    <p>Sign in with your API key to manage integrations, connections, and settings.</p>
    ${error ? `<div class="alert" style="background:#450a0a;color:#fca5a5;border:1px solid #991b1b;margin-bottom:1rem">${error}</div>` : ""}
    <form method="POST" action="/console/login">
      <div class="form-group">
        <label>API Key</label>
        <input type="password" name="apiKey" placeholder="c1_live_..." required autofocus>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">Sign in</button>
    </form>
    <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border)">
      <p style="color:var(--text3);font-size:0.8rem;margin-bottom:1rem">Don't have an account?</p>
      <form method="POST" action="/console/register">
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" placeholder="Your company" required>
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" placeholder="you@company.com" required>
        </div>
        <button type="submit" class="btn btn-outline" style="width:100%">Create account</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

// ===================== AUTH =====================

dashboard.get("/login", (c) => c.html(loginPage()));

dashboard.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const apiKey = body.apiKey as string;
  if (!apiKey) return c.html(loginPage("API key is required"));

  const database = getDb();
  const [key] = await database
    .select({ tenantId: apiKeys.tenantId })
    .from(apiKeys)
    .where(and(eq(apiKeys.key, apiKey), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!key) return c.html(loginPage("Invalid API key"));

  c.header("Set-Cookie", `connect1_key=${encodeURIComponent(apiKey)}; Path=/console; HttpOnly; SameSite=Lax; Max-Age=604800`);
  return c.redirect("/console");
});

dashboard.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const name = body.name as string;
  const email = body.email as string;

  if (!name || !email) return c.html(loginPage("Name and email are required"));

  try {
    const resp = await fetch(`${c.req.url.split("/console")[0]}/v1/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await resp.json() as Record<string, unknown>;
    if (!resp.ok) {
      return c.html(loginPage((data as any).error?.message ?? "Registration failed"));
    }

    const apiKey = data.apiKey as string;
    c.header("Set-Cookie", `connect1_key=${encodeURIComponent(apiKey)}; Path=/console; HttpOnly; SameSite=Lax; Max-Age=604800`);
    return c.redirect("/console");
  } catch {
    return c.html(loginPage("Registration failed. Try again."));
  }
});

dashboard.get("/logout", (c) => {
  c.header("Set-Cookie", "connect1_key=; Path=/console; HttpOnly; Max-Age=0");
  return c.redirect("/console/login");
});

// Auth middleware for all other dashboard routes
dashboard.use("*", async (c, next) => {
  if (c.req.path === "/console/login" || c.req.path === "/console/register" || c.req.path === "/console/logout") {
    return next();
  }
  const tenant = await getDashboardTenant(c);
  if (!tenant) return c.redirect("/console/login");
  c.set("tenantId", tenant.tenantId);
  c.set("tenantName", tenant.tenantName);
  c.set("tenantEmail", tenant.tenantEmail);
  c.set("plan", tenant.plan);
  return next();
});

// ===================== DASHBOARD HOME =====================

dashboard.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantName = c.get("tenantName");
  const database = getDb();

  const [connCount] = await database.select({ count: count() }).from(connections).where(eq(connections.tenantId, tenantId));
  const [appCount] = await database.select({ count: count() }).from(oauthApps).where(eq(oauthApps.tenantId, tenantId));
  const [keyCount] = await database.select({ count: count() }).from(apiKeys).where(eq(apiKeys.tenantId, tenantId));
  const providers = listProviders();

  const recentConns = await database
    .select({ id: connections.id, provider: connections.provider, userId: connections.userId, status: connections.status, providerEmail: connections.providerEmail, createdAt: connections.createdAt })
    .from(connections)
    .where(eq(connections.tenantId, tenantId))
    .orderBy(sql`${connections.createdAt} DESC`)
    .limit(5);

  const connRows = recentConns.length === 0
    ? '<div class="card-empty">No connections yet. Configure an integration to get started.</div>'
    : `<table><thead><tr><th>Provider</th><th>User</th><th>Status</th><th>Created</th></tr></thead><tbody>${recentConns.map(conn => `
        <tr><td><span class="badge badge-blue">${conn.provider}</span></td><td>${conn.providerEmail || conn.userId}</td><td><span class="badge badge-green">${conn.status}</span></td><td>${conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : "—"}</td></tr>`).join("")}</tbody></table>`;

  return c.html(page("Dashboard", "home", `
    <div class="page-header"><h2>Dashboard</h2><p>Overview of your Connect1 workspace.</p></div>
    <div class="stats">
      <div class="stat-card"><div class="label">Connections</div><div class="value">${connCount.count}</div></div>
      <div class="stat-card"><div class="label">Integrations</div><div class="value">${appCount.count}</div></div>
      <div class="stat-card"><div class="label">API Keys</div><div class="value">${keyCount.count}</div></div>
      <div class="stat-card"><div class="label">Available Providers</div><div class="value">${providers.length}</div></div>
    </div>
    <div class="card"><div class="card-header"><h3>Recent Connections</h3></div>${connRows}</div>

    <div class="card"><div class="card-header"><h3>Quick Start</h3></div><div class="card-body">
      <p style="color:var(--text2);margin-bottom:1rem">1. Go to <a href="/console/integrations">Integrations</a> and configure your OAuth app credentials.</p>
      <p style="color:var(--text2);margin-bottom:1rem">2. Use the SDK or API to connect your users:</p>
      <div class="code-block">curl -X POST ${process.env.API_BASE_URL || "https://connect1-api.onrender.com"}/v1/auth/connect \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"provider": "gmail", "userId": "user_123"}'</div>
    </div></div>
  `, tenantName));
});

// ===================== INTEGRATIONS =====================

dashboard.get("/integrations", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantName = c.get("tenantName");
  const database = getDb();
  const providers = listProviders();

  const configured = await database
    .select({ provider: oauthApps.provider, id: oauthApps.id, createdAt: oauthApps.createdAt })
    .from(oauthApps)
    .where(eq(oauthApps.tenantId, tenantId));

  const configuredSet = new Set(configured.map(a => a.provider));

  const [connCounts] = await database
    .select({ count: count() })
    .from(connections)
    .where(eq(connections.tenantId, tenantId));

  const cards = providers.map(p => {
    const isConfigured = configuredSet.has(p.id);
    return `<a href="/console/integrations/${p.id}" class="provider-card ${isConfigured ? "configured" : ""}" style="text-decoration:none;color:inherit">
      <h4>${p.name}</h4>
      <p style="color:var(--text3);font-size:0.8rem">${p.description ?? ""}</p>
      <div class="domains">${p.domains.map(d => `<span class="badge badge-blue">${d}</span>`).join(" ")}</div>
      <div class="status">${isConfigured ? '<span class="badge badge-green">Configured</span>' : '<span class="badge badge-gray">Not configured</span>'}</div>
    </a>`;
  }).join("");

  return c.html(page("Integrations", "integrations", `
    <div class="page-header"><h2>Integrations</h2><p>Configure OAuth credentials for each provider. You bring your own OAuth app — Connect1 handles the rest.</p></div>
    <div class="provider-grid">${cards}</div>
  `, tenantName));
});

// Integration detail / setup page
dashboard.get("/integrations/:providerId", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantName = c.get("tenantName");
  const providerId = c.req.param("providerId");
  const database = getDb();

  const connector = getConnector(providerId);
  if (!connector) return c.text("Provider not found", 404);

  const [existingApp] = await database
    .select({ id: oauthApps.id, clientId: oauthApps.clientId, scopes: oauthApps.scopes, createdAt: oauthApps.createdAt })
    .from(oauthApps)
    .where(and(eq(oauthApps.tenantId, tenantId), eq(oauthApps.provider, providerId)))
    .limit(1);

  let decryptedClientId = "";
  if (existingApp) {
    try { decryptedClientId = decrypt(existingApp.clientId, getEncryptionKey()); } catch { decryptedClientId = "••••••"; }
  }

  const connCount = await database
    .select({ count: count() })
    .from(connections)
    .where(and(eq(connections.tenantId, tenantId), eq(connections.provider, providerId)));

  const oauth = connector.config.oauth;
  const defaultScopes = oauth?.defaultScopes?.join(", ") ?? "";
  const apiKey = getCookie(c, "connect1_key") ?? "";

  return c.html(page(connector.config.name, "integrations", `
    <div class="page-header">
      <p style="margin-bottom:0.5rem"><a href="/console/integrations">&larr; Integrations</a></p>
      <h2>${connector.config.name}</h2>
      <p>${connector.config.description ?? ""}</p>
    </div>

    <div class="tabs">
      <span class="tab active">Settings</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 300px;gap:1.5rem">
      <div>
        <div class="card"><div class="card-header"><h3>${existingApp ? "Update" : "Configure"} OAuth Credentials</h3></div><div class="card-body">
          ${existingApp ? '<div class="alert alert-success">Integration is configured and active.</div>' : '<div class="alert alert-info">Enter your OAuth app credentials from the provider\'s developer console.</div>'}

          <form hx-post="/console/api/integrations/${providerId}" hx-ext="json-enc" hx-swap="none">
            <input type="hidden" name="apiKey" value="${apiKey}">
            <div class="form-group">
              <label>Client ID</label>
              <input type="text" name="clientId" placeholder="Enter client ID" value="${decryptedClientId}" required>
            </div>
            <div class="form-group">
              <label>Client Secret</label>
              <input type="password" name="clientSecret" placeholder="${existingApp ? "••••••••••• (leave empty to keep current)" : "Enter client secret"}" ${existingApp ? "" : "required"}>
            </div>
            <div class="form-group">
              <label>Scopes <span style="color:var(--text3)">(comma-separated, optional)</span></label>
              <input type="text" name="scopes" placeholder="${defaultScopes}" value="${existingApp?.scopes?.join(", ") ?? ""}">
            </div>
            <div class="form-group">
              <label>Callback URL <span style="color:var(--text3)">(add this to your OAuth app)</span></label>
              <input type="text" value="${process.env.API_BASE_URL || "https://connect1-api.onrender.com"}/v1/auth/callback" readonly style="color:var(--text3)">
            </div>
            <button type="submit" class="btn btn-primary">${existingApp ? "Update" : "Save"} Credentials</button>
            ${existingApp ? `<button type="button" class="btn btn-danger" style="margin-left:0.5rem" hx-delete="/console/api/integrations/${providerId}" hx-confirm="Remove this integration?" hx-swap="none" onclick="setTimeout(()=>location.reload(),500)">Remove</button>` : ""}
          </form>
        </div></div>
      </div>

      <div>
        <div class="card"><div class="card-header"><h3>Info</h3></div><div class="card-body" style="font-size:0.8rem;color:var(--text2)">
          <p><strong>Provider ID:</strong> ${providerId}</p>
          <p style="margin-top:0.5rem"><strong>Auth type:</strong> ${connector.config.authType}</p>
          <p style="margin-top:0.5rem"><strong>Domains:</strong> ${connector.config.domains.join(", ")}</p>
          <p style="margin-top:0.5rem"><strong>Connections:</strong> ${connCount[0].count}</p>
          ${oauth ? `<p style="margin-top:0.5rem"><strong>Auth URL:</strong><br><code style="word-break:break-all">${oauth.authUrl}</code></p>` : ""}
        </div></div>
      </div>
    </div>
  `, tenantName));
});

// ===================== CONNECTIONS =====================

dashboard.get("/connections", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantName = c.get("tenantName");
  const database = getDb();

  const conns = await database
    .select({ id: connections.id, userId: connections.userId, provider: connections.provider, status: connections.status, providerEmail: connections.providerEmail, createdAt: connections.createdAt })
    .from(connections)
    .where(eq(connections.tenantId, tenantId))
    .orderBy(sql`${connections.createdAt} DESC`)
    .limit(100);

  const rows = conns.length === 0
    ? '<div class="card-empty">No connections yet. Use the SDK or API to connect user accounts.</div>'
    : `<table><thead><tr><th>Provider</th><th>User ID</th><th>Account</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${conns.map(conn => `
        <tr>
          <td><span class="badge badge-blue">${conn.provider}</span></td>
          <td><code>${conn.userId}</code></td>
          <td>${conn.providerEmail ?? "—"}</td>
          <td><span class="badge ${conn.status === "active" ? "badge-green" : "badge-gray"}">${conn.status}</span></td>
          <td>${conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : "—"}</td>
          <td><button class="btn btn-danger btn-sm" hx-delete="/console/api/connections/${conn.id}" hx-confirm="Delete this connection?" hx-target="closest tr" hx-swap="outerHTML">Delete</button></td>
        </tr>`).join("")}</tbody></table>`;

  return c.html(page("Connections", "connections", `
    <div class="page-header"><h2>Connections</h2><p>Active OAuth connections for your users.</p></div>
    <div class="card">${rows}</div>
  `, tenantName));
});

// ===================== API KEYS =====================

dashboard.get("/api-keys", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantName = c.get("tenantName");
  const database = getDb();

  const keys = await database
    .select({ id: apiKeys.id, name: apiKeys.name, key: apiKeys.key, scopes: apiKeys.scopes, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt, isActive: apiKeys.isActive })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(sql`${apiKeys.createdAt} DESC`);

  const rows = keys.map(key => `
    <tr>
      <td>${key.name}</td>
      <td><code>${key.key.slice(0, 16)}${"•".repeat(12)}</code></td>
      <td><span class="badge ${key.isActive ? "badge-green" : "badge-gray"}">${key.isActive ? "Active" : "Revoked"}</span></td>
      <td>${key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}</td>
      <td>${key.createdAt ? new Date(key.createdAt).toLocaleDateString() : "—"}</td>
      <td>${key.isActive ? `<button class="btn btn-danger btn-sm" hx-delete="/console/api/keys/${key.id}" hx-confirm="Revoke this API key?" hx-target="closest tr" hx-swap="outerHTML">Revoke</button>` : ""}</td>
    </tr>`).join("");

  return c.html(page("API Keys", "api-keys", `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:start">
      <div><h2>API Keys</h2><p>Manage keys used to authenticate with the Connect1 API.</p></div>
      <form hx-post="/console/api/keys" hx-ext="json-enc" hx-swap="none" style="display:flex;gap:0.5rem" onsubmit="setTimeout(()=>location.reload(),500)">
        <input type="text" name="name" placeholder="Key name" required style="padding:0.45rem 0.75rem;background:var(--bg);border:1px solid var(--border);border-radius:0.375rem;color:var(--text);font-size:0.8rem;width:180px">
        <button type="submit" class="btn btn-primary">Create Key</button>
      </form>
    </div>
    <div class="card">
      <table><thead><tr><th>Name</th><th>Key</th><th>Status</th><th>Last Used</th><th>Created</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  `, tenantName));
});

// ===================== SETTINGS =====================

dashboard.get("/settings", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantName = c.get("tenantName");
  const tenantEmail = c.get("tenantEmail");
  const plan = c.get("plan");

  return c.html(page("Settings", "settings", `
    <div class="page-header"><h2>Environment Settings</h2></div>
    <div class="card"><div class="card-header"><h3>Account</h3></div><div class="card-body">
      <div style="display:grid;grid-template-columns:120px 1fr;gap:0.75rem;font-size:0.85rem">
        <span style="color:var(--text3)">Tenant ID</span><code>${tenantId}</code>
        <span style="color:var(--text3)">Name</span><span>${tenantName}</span>
        <span style="color:var(--text3)">Email</span><span>${tenantEmail}</span>
        <span style="color:var(--text3)">Plan</span><span class="badge badge-blue">${plan}</span>
      </div>
    </div></div>
    <div class="card"><div class="card-header"><h3>API Base URL</h3></div><div class="card-body">
      <code>${process.env.API_BASE_URL || "https://connect1-api.onrender.com"}</code>
    </div></div>
    <div class="card"><div class="card-header"><h3>OAuth Callback URL</h3></div><div class="card-body">
      <p style="color:var(--text2);font-size:0.85rem;margin-bottom:0.5rem">Add this URL to all your OAuth app configurations:</p>
      <code>${process.env.API_BASE_URL || "https://connect1-api.onrender.com"}/v1/auth/callback</code>
    </div></div>
  `, tenantName));
});

// ===================== API ENDPOINTS (htmx targets) =====================

// Save integration credentials
dashboard.post("/api/integrations/:providerId", async (c) => {
  const providerId = c.req.param("providerId");
  const body = await c.req.json<{ apiKey?: string; clientId: string; clientSecret?: string; scopes?: string }>();
  const apiKey = body.apiKey || getCookie(c, "connect1_key");

  if (!apiKey) return c.json({ error: { message: "Not authenticated" } }, 401);

  const payload: Record<string, unknown> = {
    provider: providerId,
    clientId: body.clientId,
  };
  if (body.clientSecret) payload.clientSecret = body.clientSecret;
  if (body.scopes) payload.scopes = body.scopes.split(",").map(s => s.trim()).filter(Boolean);

  // If no clientSecret provided and this is an update, we need to fetch the existing one
  if (!body.clientSecret) {
    const database = getDb();
    // Look up tenant from API key
    const [key] = await database.select({ tenantId: apiKeys.tenantId }).from(apiKeys).where(eq(apiKeys.key, apiKey)).limit(1);
    if (!key) return c.json({ error: { message: "Invalid key" } }, 401);

    const [existing] = await database.select({ clientSecret: oauthApps.clientSecret }).from(oauthApps)
      .where(and(eq(oauthApps.tenantId, key.tenantId), eq(oauthApps.provider, providerId))).limit(1);

    if (existing) {
      payload.clientSecret = decrypt(existing.clientSecret, getEncryptionKey());
    } else {
      return c.json({ error: { message: "Client secret is required for new integrations" } }, 400);
    }
  }

  const resp = await fetch(`${getBaseUrl(c)}/v1/auth/oauth-apps`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.json() as any;
    return c.json({ error: err.error || { message: "Failed to save" } }, resp.status as any);
  }

  return c.json({ success: true });
});

// Delete integration
dashboard.delete("/api/integrations/:providerId", async (c) => {
  const providerId = c.req.param("providerId");
  const apiKey = getCookie(c, "connect1_key");
  if (!apiKey) return c.json({ error: { message: "Not authenticated" } }, 401);

  // Find the oauthApp ID
  const database = getDb();
  const [key] = await database.select({ tenantId: apiKeys.tenantId }).from(apiKeys).where(eq(apiKeys.key, apiKey)).limit(1);
  if (!key) return c.json({ error: { message: "Invalid key" } }, 401);

  const [app] = await database.select({ id: oauthApps.id }).from(oauthApps)
    .where(and(eq(oauthApps.tenantId, key.tenantId), eq(oauthApps.provider, providerId))).limit(1);

  if (!app) return c.json({ error: { message: "Not found" } }, 404);

  const resp = await fetch(`${getBaseUrl(c)}/v1/auth/oauth-apps/${app.id}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  return c.json({ success: resp.ok });
});

// Delete connection
dashboard.delete("/api/connections/:id", async (c) => {
  const id = c.req.param("id");
  const apiKey = getCookie(c, "connect1_key");
  if (!apiKey) return c.json({ error: { message: "Not authenticated" } }, 401);

  const resp = await fetch(`${getBaseUrl(c)}/v1/connections/${id}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  return c.json({ success: resp.ok });
});

// Create API key
dashboard.post("/api/keys", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const apiKey = getCookie(c, "connect1_key");
  if (!apiKey) return c.json({ error: { message: "Not authenticated" } }, 401);

  const resp = await fetch(`${getBaseUrl(c)}/v1/tenant/api-keys`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: body.name }),
  });

  const data = await resp.json();
  return c.json(data, resp.status as any);
});

// Revoke API key
dashboard.delete("/api/keys/:id", async (c) => {
  const id = c.req.param("id");
  const apiKey = getCookie(c, "connect1_key");
  if (!apiKey) return c.json({ error: { message: "Not authenticated" } }, 401);

  const resp = await fetch(`${getBaseUrl(c)}/v1/tenant/api-keys/${id}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  return c.json({ success: resp.ok });
});

function getBaseUrl(c: any): string {
  return process.env.API_BASE_URL || `${new URL(c.req.url).origin}`;
}

export { dashboard as dashboardRoutes };
