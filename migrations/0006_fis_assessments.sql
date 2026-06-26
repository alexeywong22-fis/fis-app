-- ============================================================================
-- 階段 B · B0 — FIS 能力評估記錄追蹤 schema（純建表）
-- 雙軌設計 = 結構化評分(1-5) + 文字補充 並存：
--   Signal1 = 學生主觀 feel；Signal2 = 教練客觀觀察。
-- 兩張新表：
--   fis_assessments  一次完整評估（③Layer3 剔除結果 + ⑤雙軌 baseline）
--   fis_retests      一個 assessment 對多次 re-test（⑥雙軌 + verdict），
--                    對住 baseline 同一 target_action 比。
-- ⚠️ 只 CREATE TABLE IF NOT EXISTS，絕不 DROP / ALTER 任何現有表或數據
--    （users / progress_logs / functional_tests / pain_diagnoses /
--     weekly_assessments / fascia_tests / coaches / coach_sessions /
--     user_accounts / … 一律唔掂）。
-- 先 local：wrangler d1 migrations apply fis-db --local；驗咗先至 remote。
-- ============================================================================

-- 一次完整評估（baseline）----------------------------------------------------
CREATE TABLE IF NOT EXISTS fis_assessments (
  id                      TEXT PRIMARY KEY,    -- asm_xxx
  student_id              TEXT NOT NULL,       -- → users.id
  coach_id                TEXT NOT NULL,
  appearance_ids          TEXT NOT NULL,       -- JSON array（揀咗嘅外觀）
  active_cause_ids        TEXT NOT NULL,       -- JSON array（剔除後成立成因 = ③Layer3 結果）
  segment_scores          TEXT NOT NULL,       -- JSON（15 段加總）
  training_order          TEXT NOT NULL,       -- JSON（主訓練次序）
  target_action           TEXT,                -- 對應動作（高位下拉/推類/RDL/自訂），可 NULL
  baseline_student_score  INTEGER,             -- ⑤ Signal1 學生主觀 1-5，可 NULL
  baseline_student_note   TEXT,                -- ⑤ Signal1 文字補充，可 NULL
  baseline_coach_score    INTEGER,             -- ⑤ Signal2 教練客觀 1-5，可 NULL
  baseline_coach_note     TEXT,                -- ⑤ Signal2 文字補充，可 NULL
  created_at              INTEGER NOT NULL
);

-- re-test（一個 assessment 對多次；對住 baseline 同一 target_action 比）--------
CREATE TABLE IF NOT EXISTS fis_retests (
  id                    TEXT PRIMARY KEY,      -- rt_xxx
  assessment_id         TEXT NOT NULL,         -- → fis_assessments.id
  retest_student_score  INTEGER,               -- ⑥ Signal1 學生主觀 1-5
  retest_student_note   TEXT,                  -- ⑥ Signal1 文字補充
  retest_coach_score    INTEGER,               -- ⑥ Signal2 教練客觀 1-5
  retest_coach_note     TEXT,                  -- ⑥ Signal2 文字補充
  verdict               TEXT,                  -- 兩軌改善 / 教練睇到學生 feel 唔到(仍進步) / 兩軌都冇(重判成因)
  created_at            INTEGER NOT NULL
);

-- 查詢索引（B1 會用：按學員列評估、按評估列 re-test 時序）---------------------
CREATE INDEX IF NOT EXISTS idx_fis_assessments_student ON fis_assessments (student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fis_retests_assessment  ON fis_retests (assessment_id, created_at);
