-- Sift 初始 schema（10 张数据表 + 必要索引）。
-- 版本表 _migrations 由 migrations.ts 负责创建，不在此处定义。

CREATE TABLE IF NOT EXISTS files (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  path           TEXT NOT NULL,
  hash           TEXT,
  size           INTEGER,
  mime           TEXT,
  extracted_text TEXT,
  indexed_at     TEXT,
  status         TEXT NOT NULL DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS file_tags (
  file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (file_id, tag_id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id      INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  proposed_tag TEXT NOT NULL,
  confidence   REAL NOT NULL DEFAULT 0,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_action   TEXT NOT NULL,
  from_tag      TEXT,
  to_tag        TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern       TEXT NOT NULL,
  preferred_tag TEXT NOT NULL,
  weight        REAL NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id       TEXT NOT NULL,
  source_path    TEXT NOT NULL,
  target_path    TEXT NOT NULL,
  op_type        TEXT NOT NULL,
  suggestion_id  INTEGER,
  confidence     REAL,
  user_decision  TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS undo_batches (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id  TEXT NOT NULL UNIQUE,
  undone_at TEXT NOT NULL,
  reason    TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id       TEXT NOT NULL,
  base_url          TEXT,
  model             TEXT,
  encrypted_api_key TEXT,
  enabled           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- 必要索引
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
CREATE INDEX IF NOT EXISTS idx_operation_log_batch_id ON operation_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_created_at ON operation_log(created_at);
