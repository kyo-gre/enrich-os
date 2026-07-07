-- Enrich OS initial schema. Timestamps are unix ms integers for sortability.

CREATE TABLE IF NOT EXISTS import_history (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'xlsx')),
  row_count INTEGER NOT NULL DEFAULT 0,
  column_mapping TEXT, -- JSON
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'mapped', 'processing', 'completed', 'failed')),
  job_id TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS identity_cache (
  id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  platform TEXT,
  profile_url TEXT,
  email TEXT,
  social_handle TEXT,
  confidence_score INTEGER,
  confidence_source TEXT,
  pipeline_version TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  last_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_cache_keys (
  id TEXT PRIMARY KEY,
  identity_cache_id TEXT NOT NULL REFERENCES identity_cache(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL CHECK (key_type IN ('email', 'username', 'profile_url')),
  key_value TEXT NOT NULL, -- canonicalized form
  created_at INTEGER NOT NULL,
  UNIQUE (key_type, key_value)
);
CREATE INDEX IF NOT EXISTS idx_identity_cache_keys_identity ON identity_cache_keys(identity_cache_id);

CREATE TABLE IF NOT EXISTS manual_overrides (
  id TEXT PRIMARY KEY,
  identity_cache_id TEXT NOT NULL REFERENCES identity_cache(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_by TEXT NOT NULL DEFAULT 'local-user',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manual_overrides_identity ON manual_overrides(identity_cache_id);

CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES import_history(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,

  raw_full_name TEXT,
  raw_username TEXT,
  raw_email TEXT,
  raw_profile_url TEXT,
  raw_platform TEXT,
  raw_payload TEXT, -- JSON, original row for export round-tripping

  resolved_first_name TEXT,
  resolved_last_name TEXT,
  resolved_display_name TEXT,
  resolved_platform TEXT,
  resolved_profile_url TEXT,
  resolved_email TEXT,
  resolved_social_handle TEXT,

  confidence_score INTEGER,
  confidence_source TEXT,
  processing_status TEXT NOT NULL DEFAULT 'failed'
    CHECK (processing_status IN ('cache_hit', 'enriched', 'partially_enriched', 'needs_review', 'failed')),
  pipeline_version TEXT NOT NULL,

  needs_review INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'ignored')),
  notes TEXT,

  identity_cache_id TEXT REFERENCES identity_cache(id) ON DELETE SET NULL,
  duplicate_of_creator_id TEXT REFERENCES creators(id) ON DELETE SET NULL,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creators_import ON creators(import_id);
CREATE INDEX IF NOT EXISTS idx_creators_identity_cache ON creators(identity_cache_id);
CREATE INDEX IF NOT EXISTS idx_creators_review_status ON creators(review_status);
CREATE INDEX IF NOT EXISTS idx_creators_processing_status ON creators(processing_status);

CREATE TABLE IF NOT EXISTS profile_snapshots (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  fetched_via TEXT NOT NULL CHECK (fetched_via IN ('static', 'browser')),
  raw_snapshot TEXT NOT NULL, -- JSON: displayName/bio/metadata as scraped
  fetched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_snapshots_creator ON profile_snapshots(creator_id);

CREATE TABLE IF NOT EXISTS processing_logs (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  job_id TEXT,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'skipped', 'failed')),
  detail TEXT, -- JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_processing_logs_creator_time ON processing_logs(creator_id, created_at);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES import_history(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  last_processed_row_index INTEGER NOT NULL DEFAULT -1,
  current_creator_id TEXT,
  pipeline_version TEXT NOT NULL,
  error TEXT,
  started_at INTEGER,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_import ON jobs(import_id);

CREATE TABLE IF NOT EXISTS job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped_cache_hit')),
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE (job_id, row_index)
);
CREATE INDEX IF NOT EXISTS idx_job_items_job_status ON job_items(job_id, status, row_index);

CREATE TABLE IF NOT EXISTS export_history (
  id TEXT PRIMARY KEY,
  import_id TEXT REFERENCES import_history(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL CHECK (export_type IN ('quick', 'full')),
  filter_snapshot TEXT, -- JSON
  file_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
