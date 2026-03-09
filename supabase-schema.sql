-- Connect1 Database Schema
-- Run this in Supabase SQL Editor: Dashboard > SQL Editor > New Query

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TENANTS — AI companies using Connect1
-- ============================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  api_call_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================
-- API_KEYS — Per-tenant authentication
-- ============================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  scopes JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX api_keys_tenant_idx ON api_keys(tenant_id);
CREATE INDEX api_keys_key_idx ON api_keys(key);

-- ============================================
-- CONNECTIONS — User-provider OAuth links
-- ============================================
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  credentials TEXT NOT NULL,  -- AES-256-GCM encrypted OAuth tokens
  scopes JSONB DEFAULT '[]',
  provider_account_id VARCHAR(255),
  provider_email VARCHAR(255),
  token_expires_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX connections_tenant_user_idx ON connections(tenant_id, user_id);
CREATE INDEX connections_provider_idx ON connections(provider);

-- ============================================
-- OAUTH_STATES — Temporary OAuth flow storage
-- ============================================
CREATE TABLE oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state VARCHAR(128) NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  redirect_url TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX oauth_states_state_idx ON oauth_states(state);

-- ============================================
-- WEBHOOKS — Tenant webhook subscriptions
-- ============================================
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events JSONB DEFAULT '[]',
  secret VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX webhooks_tenant_idx ON webhooks(tenant_id);

-- ============================================
-- EVENT_LOG — Audit trail
-- ============================================
CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  domain VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL,
  resource_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX event_log_tenant_idx ON event_log(tenant_id);
CREATE INDEX event_log_connection_idx ON event_log(connection_id);
CREATE INDEX event_log_created_idx ON event_log(created_at DESC);

-- ============================================
-- SEED: Create a test tenant + API key
-- ============================================
INSERT INTO tenants (id, name, email, plan)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Connect1 Dev',
  'dev@connect1.dev',
  'free'
);

INSERT INTO api_keys (tenant_id, key, name)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'c1_dev_test_key_1234567890abcdef',
  'Development Key'
);

-- ============================================
-- RLS Policies (Row Level Security)
-- ============================================
-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (our API uses service role)
CREATE POLICY "Service role full access" ON tenants
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON api_keys
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON connections
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON oauth_states
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON webhooks
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON event_log
  FOR ALL USING (auth.role() = 'service_role');

-- Done!
-- Your test API key is: c1_dev_test_key_1234567890abcdef
