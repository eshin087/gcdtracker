-- Additive only. Existing historical datasets and collector checkpoints are untouched.
CREATE TABLE IF NOT EXISTS social_samples (
  platform text NOT NULL CHECK (platform IN ('bluesky', 'mastodon')),
  day date NOT NULL,
  collection_version smallint NOT NULL DEFAULT 1 CHECK (collection_version = 1),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL CHECK (finished_at >= started_at),
  sampled_posts integer NOT NULL CHECK (sampled_posts >= 0),
  ai_disclosure_posts integer NOT NULL CHECK (ai_disclosure_posts BETWEEN 0 AND sampled_posts),
  automated_account_posts integer NOT NULL CHECK (automated_account_posts BETWEEN 0 AND sampled_posts),
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
  outcome text NOT NULL CHECK (outcome IN ('success', 'partial')),
  coverage jsonb NOT NULL CHECK (jsonb_typeof(coverage) = 'object'),
  PRIMARY KEY (platform, day, collection_version)
);
CREATE INDEX IF NOT EXISTS social_samples_day_idx ON social_samples (day DESC);
