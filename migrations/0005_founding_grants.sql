-- ============================================================================
-- 創始 allowlist：名單入面嘅 email 一註冊就自動 course_access=1（set-and-forget）。
-- 純建表，唔喺度硬寫任何 email（自己 INSERT，例如：
--   INSERT OR IGNORE INTO founding_grants (email) VALUES ('someone@example.com');
-- email 一律全小寫存（register 會用 normalize 後嘅 email 查）。
-- 絕不 DROP / 改任何現有表或數據。
-- ============================================================================

CREATE TABLE IF NOT EXISTS founding_grants (
  email       TEXT PRIMARY KEY,                       -- 全小寫
  reason      TEXT DEFAULT 'founding',
  created_at  TEXT DEFAULT (datetime('now'))
);
