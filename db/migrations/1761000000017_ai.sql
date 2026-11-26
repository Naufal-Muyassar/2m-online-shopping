-- Up Migration

-- One row per assistant question. The daily per-user and global caps are counted from this table, so a row is
-- written as 'pending' before ml-api is called. input_text is masked before it is stored.
CREATE TABLE llm_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  branch_id uuid REFERENCES branches(id),
  thread_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('app', 'telegram')),
  feature text NOT NULL,
  intent text,
  input_text text NOT NULL,
  output_text text,
  model text,
  prompt_version text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  cached boolean NOT NULL DEFAULT false,
  fallback_used boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('pending', 'ok', 'error', 'budget')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX llm_usage_user_recent ON llm_usage (user_id, created_at);
CREATE INDEX llm_usage_recent ON llm_usage (created_at);

-- Down Migration

DROP TABLE llm_usage;
