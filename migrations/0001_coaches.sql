-- ============================================================================
-- Stage 1 — 教練帳號認證地基
-- ⚠️ 只准 CREATE 新表 / 新 index（全部 IF NOT EXISTS）。
--    絕不 ALTER / DROP / UPDATE / DELETE 任何現有表，
--    亦不觸碰 users / fascia_tests / progress_logs / pain_diagnoses /
--    functional_tests / weekly_assessments 或其任何數據。
-- ============================================================================

-- 教練帳號表
CREATE TABLE IF NOT EXISTS coaches (
  id             TEXT PRIMARY KEY,                       -- 'coach_' + uuid
  email          TEXT NOT NULL UNIQUE,                   -- 登入識別碼（統一細階儲存）
  password_hash  TEXT NOT NULL,                          -- PBKDF2 derived key（base64）
  salt           TEXT NOT NULL,                          -- 每人隨機 salt（base64）
  iterations     INTEGER NOT NULL DEFAULT 100000,        -- PBKDF2 迭代次數（記低以便日後升級）
  hash_version   INTEGER NOT NULL DEFAULT 1,             -- hash 演算法版本（向後兼容）
  role           TEXT NOT NULL DEFAULT 'coach'
                 CHECK (role IN ('admin','coach')),
  name           TEXT,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','disabled')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coaches_email ON coaches(email);

-- 伺服器端 session 表（opaque token；DB 只存 token 嘅 SHA-256，唔存 raw token）
CREATE TABLE IF NOT EXISTS coach_sessions (
  token_hash  TEXT PRIMARY KEY,                          -- SHA-256(raw token)
  coach_id    TEXT NOT NULL REFERENCES coaches(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL                              -- ISO8601；效期 12 小時
);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_coach   ON coach_sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_expires ON coach_sessions(expires_at);
