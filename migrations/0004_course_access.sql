-- ============================================================================
-- 課程權益（entitlement）：user_accounts.course_access 做 server-side single source of truth
-- 0=未付/預設、1=已付（見到「進入課程」而唔係「報名」）。
-- ⚠️ ALTER TABLE ADD COLUMN 唔支援 IF NOT EXISTS → 第一次跑乾淨；若重跑會報
--    「duplicate column name: course_access」，無害可忽略。絕不 DROP / 改現有數據。
-- ============================================================================

ALTER TABLE user_accounts ADD COLUMN course_access INTEGER NOT NULL DEFAULT 0;
