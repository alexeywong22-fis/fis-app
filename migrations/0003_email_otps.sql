-- ============================================================================
-- Email OTP 原語：無密碼登入 + 密碼重設（6 位驗證碼，purpose 重用，PWA-safe）
-- ⚠️ CREATE 全部 IF NOT EXISTS（可安全重跑）。
--    ALTER TABLE ADD COLUMN 唔支援 IF NOT EXISTS → 只可跑一次；若 email_verified
--    已存在，淨係嗰句會報「duplicate column」，其餘照行（可忽略嗰句）。
--    絕不 DROP / 改動任何現有表或數據。
-- ============================================================================

-- 一次性驗證碼（DB 只存 code 嘅 SHA-256，唔存明碼）
CREATE TABLE IF NOT EXISTS email_otps (
  id          TEXT PRIMARY KEY,                       -- 'otp_' + uuid
  email       TEXT NOT NULL,                          -- 統一細階
  code_hash   TEXT NOT NULL,                          -- SHA-256(purpose:email:code)
  purpose     TEXT NOT NULL,                          -- 'login' | 'reset'
  expires_at  TEXT NOT NULL,                          -- ISO8601（10 分鐘）
  attempts    INTEGER NOT NULL DEFAULT 0,             -- 驗證嘗試次數（達上限即作廢）
  used        INTEGER NOT NULL DEFAULT 0,             -- 0=有效 1=已用/作廢
  created_at  TEXT NOT NULL DEFAULT (datetime('now')) -- 用嚟限速（60 秒 cooldown / 每小時上限）
);
CREATE INDEX IF NOT EXISTS idx_email_otps_lookup  ON email_otps(email, purpose, used);
CREATE INDEX IF NOT EXISTS idx_email_otps_created ON email_otps(created_at);

-- user_accounts 加 email_verified（OTP 驗證成功會標 1；今次唔強制 UI）
ALTER TABLE user_accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
