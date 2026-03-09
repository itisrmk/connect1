-- Migration: Add Bring Your Own OAuth (BYOO) support
-- Run this in Supabase SQL Editor

-- OAuth Apps — tenant-owned OAuth credentials
CREATE TABLE oauth_apps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  client_id TEXT NOT NULL,        -- AES-256 encrypted
  client_secret TEXT NOT NULL,    -- AES-256 encrypted
  scopes JSONB DEFAULT '[]',
  redirect_uri TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX oauth_apps_tenant_provider_idx ON oauth_apps(tenant_id, provider);

-- Unique constraint: one OAuth app per tenant per provider
CREATE UNIQUE INDEX oauth_apps_tenant_provider_unique ON oauth_apps(tenant_id, provider);

-- RLS
ALTER TABLE oauth_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON oauth_apps
  FOR ALL USING (auth.role() = 'service_role');
