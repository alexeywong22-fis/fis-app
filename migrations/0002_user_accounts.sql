-- ============================================================================
-- 用戶 email 帳戶登入 v1（密碼）
-- ⚠️ 只 CREATE 新表 / 新 index（全部 IF NOT EXISTS）。
--    絕不 ALTER / DROP / UPDATE / DELETE 任何現有表（users / fascia_tests /
--    progress_logs / pain_diagnoses / functional_tests / weekly_assessments /
--    coaches / coach_sessions 等），亦不觸碰任何現有數據。
-- ============================================================================

-- 用戶帳戶（email + 密碼）
CREATE TABLE IF NOT EXISTS user_accounts (
  id              TEXT PRIMARY KEY,                       -- 'acct_' + uuid
  email           TEXT NOT NULL UNIQUE,                   -- 登入識別碼（統一細階儲存）
  password_hash   TEXT NOT NULL,                          -- PBKDF2 derived key（base64）
  salt            TEXT NOT NULL,                          -- 每人 16-byte 隨機 salt（base64）
  iterations      INTEGER NOT NULL DEFAULT 100000,        -- PBKDF2 迭代（Cloudflare cap 100000）
  hash_version    INTEGER NOT NULL DEFAULT 1,             -- hash 演算法版本（向後兼容）
  primary_user_id TEXT NOT NULL,                          -- bind 現有匿名 usr_（register 時 = currentUserId）
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','disabled')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_email ON user_accounts(email);

-- 伺服器端 session（opaque token；DB 只存 token 嘅 SHA-256）
CREATE TABLE IF NOT EXISTS user_account_sessions (
  token_hash  TEXT PRIMARY KEY,                           -- SHA-256(raw token)
  account_id  TEXT NOT NULL REFERENCES user_accounts(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL                               -- ISO8601；效期 30 日
);
CREATE INDEX IF NOT EXISTS idx_uas_account ON user_account_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_uas_expires ON user_account_sessions(expires_at);
