import { Hono } from "hono";
import { createDb, connections, oauthApps, apiKeys, tenants } from "@connect1/db";
import { eq, and, count, sql } from "drizzle-orm";
import { decrypt } from "connect1";
import { getConnector, listProviders } from "../lib/connectors.js";
import { randomBytes } from "node:crypto";

type DashboardEnv = {
  Variables: {
    tenantId: string;
    tenantName: string;
    tenantEmail: string;
    plan: string;
    supabaseToken: string;
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

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || "";
}

function getSupabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || "";
}

function getCookie(c: any, name: string): string | undefined {
  const cookies = c.req.header("cookie") ?? "";
  const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function generateApiKey(): string {
  return `c1_live_${randomBytes(24).toString("hex")}`;
}

// Verify Supabase JWT by calling /auth/v1/user
async function getSupabaseUser(token: string): Promise<{ id: string; email: string } | null> {
  try {
    const resp = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: getSupabaseAnonKey(),
      },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as { id: string; email: string };
    return user;
  } catch {
    return null;
  }
}

// ===================== STYLES =====================

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg: #0a0a0a;
  --surface: #141414;
  --surface2: #1a1a1a;
  --surface3: #222;
  --border: #2a2a2a;
  --border-hover: #3a3a3a;
  --text: #ededed;
  --text2: #888;
  --text3: #666;
  --accent: #ededed;
  --accent-hover: #fff;
  --blue: #3b82f6;
  --green: #22c55e;
  --green-muted: #0a2a1b;
  --red: #ef4444;
  --red-muted: #2a0a0a;
  --yellow: #eab308;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-xs: 6px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
a { color: var(--text2); text-decoration: none; transition: color 150ms; }
a:hover { color: var(--text); }
::selection { background: rgba(59,130,246,0.3); }
input::placeholder { color: var(--text3); }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* Layout */
.layout { display: flex; min-height: 100vh; }
.sidebar {
  width: 220px; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; z-index: 10;
}
.sidebar-header { padding: 20px 20px 16px; }
.sidebar-header h1 { font-size: 15px; font-weight: 600; letter-spacing: -0.3px; }
.sidebar-header .env { font-size: 11px; color: var(--text3); margin-top: 2px; font-weight: 400; }

.sidebar nav { padding: 0 8px; flex: 1; }
.sidebar nav a {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px; margin-bottom: 2px;
  color: var(--text2); font-size: 13px; font-weight: 450; border-radius: var(--radius-xs);
  transition: all 150ms;
}
.sidebar nav a:hover { color: var(--text); background: var(--surface2); }
.sidebar nav a.active { color: var(--text); background: var(--surface2); }
.sidebar nav a .icon { width: 16px; height: 16px; opacity: 0.6; }

.sidebar-footer {
  padding: 16px 20px; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.sidebar-footer .user { font-size: 12px; color: var(--text2); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-footer a { font-size: 12px; color: var(--text3); }
.sidebar-footer a:hover { color: var(--text); }

.main { margin-left: 220px; flex: 1; padding: 32px 40px; max-width: 1080px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 20px; font-weight: 600; letter-spacing: -0.4px; }
.page-header p { color: var(--text3); font-size: 13px; margin-top: 4px; }

/* Cards */
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; margin-bottom: 16px;
  transition: border-color 150ms;
}
.card:hover { border-color: var(--border-hover); }
.card-header {
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
}
.card-header h3 { font-size: 13px; font-weight: 600; }
.card-body { padding: 20px; }
.card-empty { padding: 48px 20px; text-align: center; color: var(--text3); font-size: 13px; }

/* Tables */
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left; padding: 10px 20px; font-size: 11px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.05em; color: var(--text3);
  border-bottom: 1px solid var(--border); background: var(--surface);
}
td { padding: 12px 20px; border-bottom: 1px solid var(--border); font-size: 13px; }
tr:last-child td { border-bottom: none; }
tr { transition: background 150ms; }
tbody tr:hover { background: var(--surface2); }

/* Badges */
.badge {
  display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 9999px;
  font-size: 11px; font-weight: 500; letter-spacing: 0.01em;
}
.badge-green { background: var(--green-muted); color: #4ade80; }
.badge-blue { background: rgba(59,130,246,0.12); color: #60a5fa; }
.badge-gray { background: var(--surface3); color: var(--text3); }
.badge-yellow { background: rgba(234,179,8,0.1); color: #facc15; }

/* Stats */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px; transition: border-color 150ms;
}
.stat-card:hover { border-color: var(--border-hover); }
.stat-card .label { font-size: 12px; color: var(--text3); font-weight: 500; }
.stat-card .value { font-size: 28px; font-weight: 700; margin-top: 4px; letter-spacing: -1px; }

/* Forms */
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; font-weight: 500; color: var(--text2); margin-bottom: 6px; }
.form-group .hint { font-size: 11px; color: var(--text3); font-weight: 400; }
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: 9px 12px; background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-xs); color: var(--text); font-size: 13px; font-family: inherit;
  transition: border-color 150ms, box-shadow 150ms; outline: none;
}
.form-group input:focus, .form-group select:focus {
  border-color: var(--text3); box-shadow: 0 0 0 3px rgba(255,255,255,0.04);
}
.form-group input[readonly] { color: var(--text3); cursor: default; }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 16px; border-radius: var(--radius-xs); font-size: 13px; font-weight: 500;
  border: none; cursor: pointer; font-family: inherit; transition: all 150ms; line-height: 1;
}
.btn-primary { background: var(--accent); color: var(--bg); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--surface3); border-color: var(--border-hover); }
.btn-danger { background: var(--red-muted); color: var(--red); border: 1px solid rgba(239,68,68,0.2); }
.btn-danger:hover { background: rgba(239,68,68,0.15); }
.btn-ghost { background: transparent; color: var(--text2); }
.btn-ghost:hover { color: var(--text); background: var(--surface2); }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-block { width: 100%; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Provider grid */
.provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.provider-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px; cursor: pointer; transition: all 150ms; text-decoration: none; color: inherit;
}
.provider-card:hover { border-color: var(--border-hover); transform: translateY(-1px); }
.provider-card.configured { border-color: rgba(34,197,94,0.3); }
.provider-card h4 { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.provider-card .desc { color: var(--text3); font-size: 12px; line-height: 1.4; }
.provider-card .meta { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; }

/* Toast */
.toast {
  position: fixed; top: 16px; right: 16px; padding: 10px 16px; border-radius: var(--radius-xs);
  font-size: 13px; z-index: 100; backdrop-filter: blur(8px);
  animation: slideIn 200ms ease-out;
}
.toast-success { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }
.toast-error { background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.2); }
@keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

/* Auth pages */
.auth-wrapper {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: var(--bg);
}
.auth-card {
  width: 100%; max-width: 380px; padding: 0 20px;
}
.auth-logo { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; }
.auth-subtitle { color: var(--text3); font-size: 13px; margin-bottom: 32px; line-height: 1.5; }
.auth-divider {
  display: flex; align-items: center; gap: 12px; margin: 24px 0;
  color: var(--text3); font-size: 12px;
}
.auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.auth-footer { text-align: center; margin-top: 24px; font-size: 13px; color: var(--text3); }
.auth-footer a { color: var(--text2); }
.auth-footer a:hover { color: var(--text); }

/* Alert */
.alert { padding: 10px 14px; border-radius: var(--radius-xs); font-size: 13px; margin-bottom: 16px; line-height: 1.4; }
.alert-info { background: rgba(59,130,246,0.08); color: #93c5fd; border: 1px solid rgba(59,130,246,0.15); }
.alert-success { background: rgba(34,197,94,0.08); color: #86efac; border: 1px solid rgba(34,197,94,0.15); }
.alert-error { background: rgba(239,68,68,0.08); color: #fca5a5; border: 1px solid rgba(239,68,68,0.15); }

/* Code */
code {
  background: var(--surface2); padding: 2px 6px; border-radius: 4px;
  font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace;
}
.code-block {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xs);
  padding: 16px; font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px; overflow-x: auto; white-space: pre; line-height: 1.6;
  color: var(--text2);
}

/* Tabs */
.tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.tab {
  padding: 10px 16px; font-size: 13px; color: var(--text3); font-weight: 500;
  border-bottom: 2px solid transparent; cursor: pointer; text-decoration: none;
  transition: all 150ms;
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--text); border-bottom-color: var(--text); }

/* Utility */
.flex { display: flex; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.mt-1 { margin-top: 4px; }
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }
.mt-4 { margin-top: 16px; }
.mb-4 { margin-bottom: 16px; }
.text-sm { font-size: 13px; }
.text-xs { font-size: 12px; }
.text-muted { color: var(--text3); }
.font-mono { font-family: 'SF Mono', 'Fira Code', monospace; }

/* New key reveal */
.key-reveal {
  background: var(--surface); border: 1px solid rgba(34,197,94,0.3); border-radius: var(--radius-xs);
  padding: 16px; margin-bottom: 16px;
}
.key-reveal .key-value {
  background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-xs);
  padding: 10px 12px; font-family: 'SF Mono', monospace; font-size: 12px;
  word-break: break-all; margin-top: 8px; color: var(--green);
}
`;

// ===================== TEMPLATES =====================

function page(title: string, activePage: string, content: string, tenantEmail?: string): string {
  const navItems = [
    { id: "home", label: "Overview", href: "/console", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
    { id: "integrations", label: "Integrations", href: "/console/integrations", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { id: "connections", label: "Connections", href: "/console/connections", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
    { id: "api-keys", label: "API Keys", href: "/console/api-keys", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
    { id: "settings", label: "Settings", href: "/console/settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  ];

  const nav = navItems.map(item =>
    `<a href="${item.href}" class="${activePage === item.id ? "active" : ""}">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="${item.icon}"/></svg>
      ${item.label}
    </a>`
  ).join("");

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
        <div class="env">Dashboard</div>
      </div>
      <nav>${nav}</nav>
      <div class="sidebar-footer">
        <span class="user">${tenantEmail ?? ""}</span>
        <a href="/console/logout">Sign out</a>
      </div>
    </div>
    <div class="main">${content}</div>
  </div>
  <script>
    document.body.addEventListener('htmx:afterRequest', function(e) {
      if (e.detail.successful && e.detail.xhr.status < 300) {
        var t = document.createElement('div');
        t.className = 'toast toast-success';
        t.textContent = 'Saved successfully';
        document.body.appendChild(t);
        setTimeout(function(){ t.remove(); }, 3000);
      }
    });
    document.body.addEventListener('htmx:responseError', function(e) {
      var t = document.createElement('div');
      t.className = 'toast toast-error';
      try { t.textContent = JSON.parse(e.detail.xhr.responseText).error.message; } catch(x) { t.textContent = 'Something went wrong'; }
      document.body.appendChild(t);
      setTimeout(function(){ t.remove(); }, 4000);
    });
  </script>
</body>
</html>`;
}

function authPage(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Connect1</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="auth-wrapper">
    <div class="auth-card">${content}</div>
  </div>
</body>
</html>`;
}

// ===================== AUTH — SUPABASE =====================

dashboard.get("/login", (c) => {
  const error = c.req.query("error");
  return c.html(authPage("Sign in", `
    <div class="auth-logo">Connect1</div>
    <div class="auth-subtitle">Sign in to manage your integrations, connections, and API keys.</div>
    ${error ? `<div class="alert alert-error">${error}</div>` : ""}
    <form method="POST" action="/console/login">
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" placeholder="you@company.com" required autofocus>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" placeholder="Enter your password" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:8px">Sign in</button>
    </form>
    <div class="auth-footer">
      Don't have an account? <a href="/console/signup">Create one</a>
    </div>
  `));
});

dashboard.get("/signup", (c) => {
  const error = c.req.query("error");
  return c.html(authPage("Create account", `
    <div class="auth-logo">Connect1</div>
    <div class="auth-subtitle">Create your account to start building integrations.</div>
    ${error ? `<div class="alert alert-error">${error}</div>` : ""}
    <form method="POST" action="/console/signup">
      <div class="form-group">
        <label>Company name</label>
        <input type="text" name="name" placeholder="Acme Inc." required autofocus>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" placeholder="you@company.com" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" placeholder="Min 6 characters" required minlength="6">
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:8px">Create account</button>
    </form>
    <div class="auth-footer">
      Already have an account? <a href="/console/login">Sign in</a>
    </div>
  `));
});

dashboard.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = body.email as string;
  const password = body.password as string;

  if (!email || !password) {
    return c.redirect("/console/login?error=" + encodeURIComponent("Email and password are required"));
  }

  try {
    const resp = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({ email, password }),
    });

    if (!resp.ok) {
      const err = (await resp.json()) as { error_description?: string; msg?: string };
      const msg = err.error_description || err.msg || "Invalid credentials";
      return c.redirect("/console/login?error=" + encodeURIComponent(msg));
    }

    const data = (await resp.json()) as { access_token: string; refresh_token: string; expires_in: number };
    c.header("Set-Cookie", `c1_token=${encodeURIComponent(data.access_token)}; Path=/console; HttpOnly; SameSite=Lax; Max-Age=${data.expires_in}`);
    return c.redirect("/console");
  } catch {
    return c.redirect("/console/login?error=" + encodeURIComponent("Login failed. Try again."));
  }
});

dashboard.post("/signup", async (c) => {
  const body = await c.req.parseBody();
  const name = body.name as string;
  const email = body.email as string;
  const password = body.password as string;

  if (!name || !email || !password) {
    return c.redirect("/console/signup?error=" + encodeURIComponent("All fields are required"));
  }

  try {
    // 1. Create Supabase auth user
    const signupResp = await fetch(`${getSupabaseUrl()}/auth/v1/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({ email, password }),
    });

    if (!signupResp.ok) {
      const err = (await signupResp.json()) as { msg?: string; message?: string };
      return c.redirect("/console/signup?error=" + encodeURIComponent(err.msg || err.message || "Signup failed"));
    }

    // 2. Sign in to get the token
    const loginResp = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({ email, password }),
    });

    if (!loginResp.ok) {
      // User created but email confirmation might be required
      return c.redirect("/console/login?error=" + encodeURIComponent("Account created. Please check your email to confirm, then sign in."));
    }

    const loginData = (await loginResp.json()) as { access_token: string; expires_in: number };

    // 3. Create tenant + API key in our database
    const database = getDb();
    const [existing] = await database
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.email, email))
      .limit(1);

    if (!existing) {
      const [tenant] = await database
        .insert(tenants)
        .values({ name, email, plan: "free" })
        .returning();

      const key = generateApiKey();
      await database.insert(apiKeys).values({
        tenantId: tenant.id,
        key,
        name: "Default Key",
      });
    }

    c.header("Set-Cookie", `c1_token=${encodeURIComponent(loginData.access_token)}; Path=/console; HttpOnly; SameSite=Lax; Max-Age=${loginData.expires_in}`);
    return c.redirect("/console");
  } catch {
    return c.redirect("/console/signup?error=" + encodeURIComponent("Signup failed. Try again."));
  }
});

dashboard.get("/logout", (c) => {
  c.header("Set-Cookie", "c1_token=; Path=/console; HttpOnly; Max-Age=0");
  return c.redirect("/console/login");
});

// Auth middleware — verify Supabase token and resolve tenant
dashboard.use("*", async (c, next) => {
  const path = c.req.path;
  if (path === "/console/login" || path === "/console/signup" || path === "/console/logout") {
    return next();
  }

  const token = getCookie(c, "c1_token");
  if (!token) return c.redirect("/console/login");

  const user = await getSupabaseUser(token);
  if (!user) {
    c.header("Set-Cookie", "c1_token=; Path=/console; HttpOnly; Max-Age=0");
    return c.redirect("/console/login");
  }

  // Look up tenant by email
  const database = getDb();
  const [tenant] = await database
    .select({ id: tenants.id, name: tenants.name, email: tenants.email, plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.email, user.email))
    .limit(1);

  if (!tenant) {
    // Tenant not found — create one automatically
    const [newTenant] = await database
      .insert(tenants)
      .values({ name: user.email.split("@")[0], email: user.email, plan: "free" })
      .returning();

    const key = generateApiKey();
    await database.insert(apiKeys).values({ tenantId: newTenant.id, key, name: "Default Key" });

    c.set("tenantId", newTenant.id);
    c.set("tenantName", newTenant.name);
    c.set("tenantEmail", newTenant.email);
    c.set("plan", newTenant.plan);
  } else {
    c.set("tenantId", tenant.id);
    c.set("tenantName", tenant.name);
    c.set("tenantEmail", tenant.email);
    c.set("plan", tenant.plan);
  }
  c.set("supabaseToken", token);
  return next();
});

// ===================== DASHBOARD HOME =====================

dashboard.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantEmail = c.get("tenantEmail");
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
    : `<table><thead><tr><th>Provider</th><th>User</th><th>Status</th><th>Created</th></tr></thead><tbody>${recentConns.map(conn =>
        `<tr><td><span class="badge badge-blue">${conn.provider}</span></td><td style="color:var(--text2)">${conn.providerEmail || conn.userId}</td><td><span class="badge badge-green">${conn.status}</span></td><td style="color:var(--text3)">${conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : "—"}</td></tr>`
      ).join("")}</tbody></table>`;

  return c.html(page("Overview", "home", `
    <div class="page-header"><h2>Overview</h2><p>Your Connect1 workspace at a glance.</p></div>
    <div class="stats">
      <div class="stat-card"><div class="label">Connections</div><div class="value">${connCount.count}</div></div>
      <div class="stat-card"><div class="label">Integrations</div><div class="value">${appCount.count}</div></div>
      <div class="stat-card"><div class="label">API Keys</div><div class="value">${keyCount.count}</div></div>
      <div class="stat-card"><div class="label">Providers</div><div class="value">${providers.length}</div></div>
    </div>
    <div class="card"><div class="card-header"><h3>Recent Connections</h3></div>${connRows}</div>
    <div class="card"><div class="card-header"><h3>Quick Start</h3></div><div class="card-body">
      <p class="text-sm text-muted mb-4">1. Go to <a href="/console/integrations" style="color:var(--text)">Integrations</a> and configure your OAuth credentials.</p>
      <p class="text-sm text-muted mb-4">2. Use the SDK or API to connect users:</p>
      <div class="code-block">curl -X POST ${process.env.API_BASE_URL || "https://connect1-api.onrender.com"}/v1/auth/connect \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"provider": "gmail", "userId": "user_123"}'</div>
    </div></div>
  `, tenantEmail));
});

// ===================== INTEGRATIONS =====================

dashboard.get("/integrations", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantEmail = c.get("tenantEmail");
  const database = getDb();
  const providers = listProviders();

  const configured = await database
    .select({ provider: oauthApps.provider })
    .from(oauthApps)
    .where(eq(oauthApps.tenantId, tenantId));

  const configuredSet = new Set(configured.map(a => a.provider));

  const cards = providers.map(p => {
    const isConfigured = configuredSet.has(p.id);
    return `<a href="/console/integrations/${p.id}" class="provider-card ${isConfigured ? "configured" : ""}">
      <h4>${p.name}</h4>
      <p class="desc">${p.description ?? ""}</p>
      <div class="meta">
        <div>${p.domains.map(d => `<span class="badge badge-blue">${d}</span>`).join(" ")}</div>
        <span>${isConfigured ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Setup required</span>'}</span>
      </div>
    </a>`;
  }).join("");

  return c.html(page("Integrations", "integrations", `
    <div class="page-header"><h2>Integrations</h2><p>Configure OAuth credentials for each provider. Bring your own OAuth app — Connect1 handles the rest.</p></div>
    <div class="provider-grid">${cards}</div>
  `, tenantEmail));
});

// Integration detail
dashboard.get("/integrations/:providerId", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantEmail = c.get("tenantEmail");
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
    try { decryptedClientId = decrypt(existingApp.clientId, getEncryptionKey()); } catch { decryptedClientId = ""; }
  }

  const connCount = await database
    .select({ count: count() })
    .from(connections)
    .where(and(eq(connections.tenantId, tenantId), eq(connections.provider, providerId)));

  const oauth = connector.config.oauth;
  const defaultScopes = oauth?.defaultScopes?.join(", ") ?? "";

  // Get an active API key for this tenant to use in htmx calls
  const [activeKey] = await database
    .select({ key: apiKeys.key })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.isActive, true)))
    .limit(1);
  const tenantApiKey = activeKey?.key ?? "";

  return c.html(page(connector.config.name, "integrations", `
    <div class="page-header">
      <p class="mb-4"><a href="/console/integrations" style="color:var(--text2)">&larr; Back to integrations</a></p>
      <h2>${connector.config.name}</h2>
      <p>${connector.config.description ?? ""}</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 280px;gap:16px">
      <div>
        <div class="card"><div class="card-header"><h3>${existingApp ? "Update" : "Configure"} OAuth Credentials</h3></div><div class="card-body">
          ${existingApp
            ? '<div class="alert alert-success">Integration is configured and active.</div>'
            : '<div class="alert alert-info">Enter your OAuth app credentials from the provider\'s developer console.</div>'}

          <form hx-post="/console/api/integrations/${providerId}" hx-ext="json-enc" hx-swap="none">
            <input type="hidden" name="apiKey" value="${tenantApiKey}">
            <div class="form-group">
              <label>Client ID</label>
              <input type="text" name="clientId" placeholder="Enter your client ID" value="${decryptedClientId}" required>
            </div>
            <div class="form-group">
              <label>Client Secret</label>
              <input type="password" name="clientSecret" placeholder="${existingApp ? "Leave empty to keep current" : "Enter your client secret"}" ${existingApp ? "" : "required"}>
            </div>
            <div class="form-group">
              <label>Scopes <span class="hint">(comma-separated, optional)</span></label>
              <input type="text" name="scopes" placeholder="${defaultScopes}" value="${existingApp?.scopes?.join(", ") ?? ""}">
            </div>
            <div class="form-group">
              <label>Callback URL <span class="hint">(add this to your OAuth app)</span></label>
              <input type="text" value="${process.env.API_BASE_URL || "https://connect1-api.onrender.com"}/v1/auth/callback" readonly>
            </div>
            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary">${existingApp ? "Update credentials" : "Save credentials"}</button>
              ${existingApp ? `<button type="button" class="btn btn-danger" hx-delete="/console/api/integrations/${providerId}" hx-confirm="Remove this integration?" hx-swap="none" onclick="setTimeout(function(){location.reload()},500)">Remove</button>` : ""}
            </div>
          </form>
        </div></div>
      </div>

      <div>
        <div class="card"><div class="card-header"><h3>Details</h3></div><div class="card-body">
          <div style="font-size:12px;color:var(--text2);display:grid;gap:10px">
            <div><span style="color:var(--text3)">Provider ID</span><br><code>${providerId}</code></div>
            <div><span style="color:var(--text3)">Auth type</span><br>${connector.config.authType}</div>
            <div><span style="color:var(--text3)">Domains</span><br>${connector.config.domains.join(", ")}</div>
            <div><span style="color:var(--text3)">Connections</span><br>${connCount[0].count}</div>
            ${oauth ? `<div><span style="color:var(--text3)">Auth URL</span><br><span style="word-break:break-all;font-size:11px">${oauth.authUrl}</span></div>` : ""}
          </div>
        </div></div>
      </div>
    </div>
  `, tenantEmail));
});

// ===================== CONNECTIONS =====================

dashboard.get("/connections", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantEmail = c.get("tenantEmail");
  const database = getDb();

  const conns = await database
    .select({ id: connections.id, userId: connections.userId, provider: connections.provider, status: connections.status, providerEmail: connections.providerEmail, createdAt: connections.createdAt })
    .from(connections)
    .where(eq(connections.tenantId, tenantId))
    .orderBy(sql`${connections.createdAt} DESC`)
    .limit(100);

  const rows = conns.length === 0
    ? '<div class="card-empty">No connections yet. Use the SDK or API to connect user accounts.</div>'
    : `<table><thead><tr><th>Provider</th><th>User ID</th><th>Account</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${conns.map(conn =>
        `<tr>
          <td><span class="badge badge-blue">${conn.provider}</span></td>
          <td><code>${conn.userId}</code></td>
          <td style="color:var(--text2)">${conn.providerEmail ?? "—"}</td>
          <td><span class="badge ${conn.status === "active" ? "badge-green" : "badge-gray"}">${conn.status}</span></td>
          <td style="color:var(--text3)">${conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : "—"}</td>
          <td><button class="btn btn-danger btn-sm" hx-delete="/console/api/connections/${conn.id}" hx-confirm="Delete this connection?" hx-target="closest tr" hx-swap="outerHTML">Delete</button></td>
        </tr>`
      ).join("")}</tbody></table>`;

  return c.html(page("Connections", "connections", `
    <div class="page-header"><h2>Connections</h2><p>Active OAuth connections for your users.</p></div>
    <div class="card">${rows}</div>
  `, tenantEmail));
});

// ===================== API KEYS =====================

dashboard.get("/api-keys", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantEmail = c.get("tenantEmail");
  const database = getDb();

  const keys = await database
    .select({ id: apiKeys.id, name: apiKeys.name, key: apiKeys.key, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt, isActive: apiKeys.isActive })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(sql`${apiKeys.createdAt} DESC`);

  const rows = keys.map(key =>
    `<tr>
      <td style="font-weight:500">${key.name}</td>
      <td><code>${key.key.slice(0, 12)}${"•".repeat(8)}${key.key.slice(-4)}</code></td>
      <td><span class="badge ${key.isActive ? "badge-green" : "badge-gray"}">${key.isActive ? "Active" : "Revoked"}</span></td>
      <td style="color:var(--text3)">${key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}</td>
      <td style="color:var(--text3)">${key.createdAt ? new Date(key.createdAt).toLocaleDateString() : "—"}</td>
      <td>${key.isActive ? `<button class="btn btn-danger btn-sm" hx-delete="/console/api/keys/${key.id}" hx-confirm="Revoke this API key?" hx-target="closest tr" hx-swap="outerHTML">Revoke</button>` : ""}</td>
    </tr>`
  ).join("");

  return c.html(page("API Keys", "api-keys", `
    <div class="page-header flex justify-between items-center">
      <div><h2>API Keys</h2><p>Manage keys for authenticating with the Connect1 API.</p></div>
      <form hx-post="/console/api/keys" hx-ext="json-enc" hx-swap="none" class="flex gap-2" onsubmit="setTimeout(function(){location.reload()},600)">
        <input type="text" name="name" placeholder="Key name" required style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-xs);color:var(--text);font-size:13px;width:180px">
        <button type="submit" class="btn btn-primary">Create key</button>
      </form>
    </div>
    <div class="card">
      <table><thead><tr><th>Name</th><th>Key</th><th>Status</th><th>Last Used</th><th>Created</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  `, tenantEmail));
});

// ===================== SETTINGS =====================

dashboard.get("/settings", async (c) => {
  const tenantId = c.get("tenantId");
  const tenantName = c.get("tenantName");
  const tenantEmail = c.get("tenantEmail");
  const plan = c.get("plan");

  return c.html(page("Settings", "settings", `
    <div class="page-header"><h2>Settings</h2><p>Manage your workspace configuration.</p></div>

    <div class="card"><div class="card-header"><h3>Account</h3></div><div class="card-body">
      <div style="display:grid;grid-template-columns:140px 1fr;gap:12px;font-size:13px">
        <span style="color:var(--text3)">Tenant ID</span><code>${tenantId}</code>
        <span style="color:var(--text3)">Name</span><span>${tenantName}</span>
        <span style="color:var(--text3)">Email</span><span>${tenantEmail}</span>
        <span style="color:var(--text3)">Plan</span><span class="badge badge-blue">${plan}</span>
      </div>
    </div></div>

    <div class="card"><div class="card-header"><h3>API Configuration</h3></div><div class="card-body">
      <div class="form-group">
        <label>API Base URL</label>
        <input type="text" value="${process.env.API_BASE_URL || "https://connect1-api.onrender.com"}" readonly>
      </div>
      <div class="form-group">
        <label>OAuth Callback URL <span class="hint">(add this to all your OAuth app configs)</span></label>
        <input type="text" value="${process.env.API_BASE_URL || "https://connect1-api.onrender.com"}/v1/auth/callback" readonly>
      </div>
    </div></div>
  `, tenantEmail));
});

// ===================== API ENDPOINTS (htmx) =====================

// Helper: get tenant API key from cookie or resolve from tenant
async function getTenantApiKey(c: any): Promise<string | null> {
  const tenantId = c.get("tenantId");
  if (!tenantId) return null;
  const database = getDb();
  const [key] = await database
    .select({ key: apiKeys.key })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.isActive, true)))
    .limit(1);
  return key?.key ?? null;
}

// Save integration credentials
dashboard.post("/api/integrations/:providerId", async (c) => {
  const providerId = c.req.param("providerId");
  const body = await c.req.json<{ apiKey?: string; clientId: string; clientSecret?: string; scopes?: string }>();
  const apiKey = body.apiKey || await getTenantApiKey(c);

  if (!apiKey) return c.json({ error: { message: "Not authenticated" } }, 401);

  const payload: Record<string, unknown> = {
    provider: providerId,
    clientId: body.clientId,
  };
  if (body.clientSecret) payload.clientSecret = body.clientSecret;
  if (body.scopes) payload.scopes = body.scopes.split(",").map(s => s.trim()).filter(Boolean);

  if (!body.clientSecret) {
    const database = getDb();
    const tenantId = c.get("tenantId");
    const [existing] = await database.select({ clientSecret: oauthApps.clientSecret }).from(oauthApps)
      .where(and(eq(oauthApps.tenantId, tenantId), eq(oauthApps.provider, providerId))).limit(1);

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
  const apiKey = await getTenantApiKey(c);
  if (!apiKey) return c.json({ error: { message: "Not authenticated" } }, 401);

  const database = getDb();
  const tenantId = c.get("tenantId");
  const [app] = await database.select({ id: oauthApps.id }).from(oauthApps)
    .where(and(eq(oauthApps.tenantId, tenantId), eq(oauthApps.provider, providerId))).limit(1);

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
  const apiKey = await getTenantApiKey(c);
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
  const apiKey = await getTenantApiKey(c);
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
  const apiKey = await getTenantApiKey(c);
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
