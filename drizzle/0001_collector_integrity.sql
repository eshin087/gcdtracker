-- Additive collector integrity migration. Existing observations remain version 1.
-- Apply only to an isolated test database first; this file does not run automatically.
BEGIN;
CREATE TABLE IF NOT EXISTS collector_state (
  key text PRIMARY KEY,
  state jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE osm_changesets ADD COLUMN IF NOT EXISTS collection_version smallint NOT NULL DEFAULT 1;
ALTER TABLE osm_daily ADD COLUMN IF NOT EXISTS collection_version smallint NOT NULL DEFAULT 1;
DO $$
DECLARE existing_pk text;
BEGIN
  SELECT conname INTO existing_pk FROM pg_constraint
  WHERE conrelid = 'osm_daily'::regclass AND contype = 'p';
  IF existing_pk IS NOT NULL THEN EXECUTE format('ALTER TABLE osm_daily DROP CONSTRAINT %I', existing_pk); END IF;
END $$;
ALTER TABLE osm_daily ADD PRIMARY KEY (day, collection_version);
CREATE TABLE IF NOT EXISTS osm_sample_seen (
  id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL,
  closed_at timestamptz NOT NULL,
  day date NOT NULL,
  ai_kind text,
  editor text
);
CREATE INDEX IF NOT EXISTS osm_sample_seen_day_idx ON osm_sample_seen(day);
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unknown';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS sync_version smallint NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS gh_archive_completed (
  hour text PRIMARY KEY,
  ingest_version smallint NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
