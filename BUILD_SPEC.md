# FIS 能力指標系統 — BUILD_SPEC（MVP 一二期）

> 畀 Claude Code / Cursor 落地用。日期 2026-06-26。
> 目標:教練後台「能力評估」模組 —— 教練揀外觀 → 交叉排除 → 出方案(線+次序+V片+安全網),再記錄追蹤學生進度。
> ⚠️ 教育性參考,非醫療診斷。所有對外輸出守 §合規紅線。

---

## 0. 鐵律（Claude Code 必讀,務必跟）

1. **分兩階段起,唔好一次過。** 先起完階段 A(判斷引擎)、測通,先至起階段 B(記錄追蹤)。
   - 理由:引擎係地基;地基穩先加數據庫。一次過起,出 bug 分唔清係引擎錯定 D1 錯。
2. **每階段獨立可測**(Alexey real-device verification 習慣)。每階段尾有「驗證 checklist」,iPhone 截圖過咗先入下一步。
3. **唔改三主檔檔名**:index.html / progress-hub.html / coach.html / fis-worker.js 永遠呢啲名。
4. **engine data + 引擎邏輯放 Worker 後端**,唔好放前端(保護 IP)。client 只送「揀咗咩外觀」。
5. **部署**:Worker 用 `export CLOUDFLARE_API_TOKEN=xxx`(靜默) + `npm run deploy`;`pwd` 確認喺 fis-app 項目先做 wrangler。
6. **engine data 內容係 Alexey 臨床 IP**,由 `FIS_57_full_merged.md` 結構化抽取。Claude Code 唔自己作成因/權重 —— schema + 頭前引 sample 見 A0,其餘外觀由 Alexey/chat 提供 JSON。
7. **⚠️ 數據 vs 哲學對齊原則(重要):** 116 成因數據係喺「缺口1第三版 + routing rule」哲學定型**之前** build 嘅,所以個別成因嘅權重/order 可能同最新立場有 tension(例:頭前引 1-S1 order 原寫「深前線(頸深層)」、DFL上 權重會衝第一,同「頸深屈⊘不直接練」打架)。**將來補其餘 18 外觀落 JSON 時:**
   - **唔好直接搬 full_merged 舊數據入 JSON**
   - 每個外觀逐個用「第三版 + routing rule 之後嘅哲學」對齊一次(check:有冇上段例外路徑段衝主次序?order framing 有冇暗示孤立練上段?)
   - 頭前引(外觀1)已逐個照出嚟、逐個校 —— 後續外觀同樣對待

---

## 工具分工總表

| 工件 | 工具 |
|---|---|
| engine data JSON(`fis_engine.json`) | 內容由 chat/Alexey 提供 → 放 repo(Cursor 或直接) |
| 引擎邏輯(排除/權重加總/出次序) | **Claude Code**(Worker) |
| Worker API(`/api/fis/*`) | **Claude Code** |
| D1 新 table + migration | **Claude Code**(wrangler d1) |
| coach.html 新 tab UI | **Cursor** |

---

# 階段 A — 判斷引擎（①揀外觀 ②交叉排除 ④出方案）

> 完成定義:教練喺 coach.html 揀外觀(含頭前引)→ 用 Layer3 剔除 → **即時出方案(15段次序 + V片 + 安全網)**。全程 in-memory,唔存 D1。

## A0. engine data — JSON schema + 頭前引 reference sample

檔名 `fis_engine.json`,bundle 入 Worker(`import engine from './fis_engine.json'`)。

### 結構
```json
{
  "appearances": [
    { "id": 1, "name": "頭前引", "plane": "矢狀+五面", "cause_ids": ["1-S1","1-S2","1-S3","1-S4","1-F1","1-R1","1-L1","1-U1"] }
  ],
  "causes": [
    {
      "id": "1-S1",
      "name": "深頸屈失力型",
      "appearance": 1,
      "reasoning": { "AT": "...", "PT": "...", "SC": "..." },
      "layer3": { "test": "仰臥 craniocervical flexion test (CCFT)", "confirm": "深頸屈無力 / SCM 暴起 → 成立" },
      "weights": {
        "DFL": [3,1,0],
        "SFL": [3,1],
        "SBL": ["T2->DFL上",0,0,0],
        "SPR": [0,0,0],
        "LL":  [0,0,0]
      },
      "app_plain": {
        "title": "深層頸部穩定不足",
        "explain": "頭前移,多數因為深層頸部肌肉冇撐住個頭,令淺層頂上去做唔屬於佢嘅工,變緊。",
        "focus": "唔係拉鬆緊嗰啲 —— 係練返深層撐起,緊嗰啲自然放鬆。",
        "order": ["深前線(頸深層)","淺前線(卸走頸前)"]
      }
    }
  ],
  "segments": ["DFL上","DFL中","DFL下","SFL上","SFL下","SBL上","SBL胸","SBL腰","SBL下","SPR上","SPR中","SPR下","LL上","LL中","LL下"],
  "video_map": {
    "DFL中": ["V1","V2","V3","U1"], "DFL下": ["V4","V5"],
    "SFL下": ["V16","V17","V18"], "SBL胸": ["U3","U4","V9"],
    "SBL腰": [], "SBL下": ["V13","V14","V15","D3"],
    "SPR上": ["V10"], "SPR中": ["V9","U3","V10","V11","V12"], "SPR下": ["V12","V5"],
    "LL中": ["V6","V7","V8","D4"], "LL下": ["V7","V8"],
    "DFL上": ["缺口1第三版(例外路徑,片待補拍)"], "SFL上": [], "SBL上": [], "LL上": []
  },
  "safety_net": {
    "neuro_referral": {
      "trigger_appearances": [1],
      "symptoms": ["手麻","手指刺痛","抓握力下降","上肢放射性痛","手部反應遲鈍","頭暈"],
      "action": "即停 + 轉介真人 / 睇醫生。唔好用『練五線』處理。"
    }
  }
}
```

### 權重格式解碼（引擎邏輯要識讀）
- 每線 array 對應該線各段(DFL 3段=上中下;SFL 2段=上下;SBL 4段=上胸腰下;SPR 3段;LL 3段),共 15 段。
- 數字 0-3 = 該段訓練權重(3最高)。
- 字串如 `"T2->DFL上"` = 「太緊」代號 redirect:呢段係代償緊(唔直接練),指向另一段。引擎**唔當佢正權重加總**,改為喺方案輸出做 note 顯示。

### A0 task
- [ ] 定 `fis_engine.json` 檔,放入頭前引(外觀1)全 8 成因(1-S1~1-S8)。
- [ ] 1-S1 sample 如上(由 full_merged 抽)。**其餘 1-S2~1-S8 + 全 segments/video_map/safety_net 由 chat 提供完整 JSON**(Claude Code 唔自己作)。

## A1. Worker API — 引擎(Claude Code)

`POST /api/fis/assess`
```
入: { "appearance_ids": [1], "excluded_cause_ids": ["1-S3","1-S5"] }
       （appearance_ids = 教練揀嘅外觀;excluded = 教練用 Layer3 剔除咗嘅成因）
出: {
  "candidate_causes": [ { id, name, reasoning, layer3 } ],   // 未剔除前全候選(畀教練睇住剔)
  "active_causes": [...],                                     // 剔除後成立成因
  "segment_scores": { "DFL上": 0, "DFL中": 4, ... },          // 15段加總(跳過 T代號)
  "training_order": [ {segment:"DFL中", score:4, videos:["V3","V4"]}, ... ],  // 高→低排序(已抽走例外路徑段)
  "exception_path": [ {segment:"DFL上", score:14, trigger:"五線行過 + re-test 仍見殘留先用", videos:["缺口1第三版..."]}, ... ],  // routing 抽出,唔混入主次序
  "t_notes": [ "SBL上: T2 代償,指向 DFL上,唔直接練" ],
  "safety_flags": [ "外觀含頭前引 → 若學生有手麻/抓握無力/放射痛/頭暈,即停轉介" ]
}
```
引擎邏輯:
1. 由 appearance_ids 收集所有 cause_ids → 候選成因。
2. 減去 excluded_cause_ids → active_causes。
3. active_causes 嘅 weights 逐段加總(數字),T代號 string 跳過加總、收集入 t_notes。
4. **routing(重要,對齊第三版):segment_scores 計完後,先抽走 `engine.routing.exception_path_segments`(DFL上/SFL上/SBL上/LL上) → 入 `exception_path` 區,每段標 trigger「五線行過 + re-test 仍見殘留先用」。** 呢啲段**唔參與主次序排名**(否則頸深屈會衝第一,違 8.3 + 缺口1第三版)。
5. 剩低**五線可練段**先由高到低排序 → training_order,每段查 video_map 填 videos。
6. 若任一 appearance ∈ safety_net.trigger_appearances → 加 safety_flags。

- [ ] 寫 `/api/fis/assess`,純計算,唔掂 D1。
- [ ] curl/Postman 測:送頭前引 → 出 training_order + videos + safety_flags。

## A2. coach.html 新 tab — 最簡 UI(Cursor)

- [ ] coach.html 新增 tab「能力評估」(共用現有教練登入)。
- [ ] Step 1 揀學員(複用現有學員列表,揀一個)。
- [ ] Step 2 揀外觀(19 個多選 checkbox)。
- [ ] Step 3 撳「分析」→ call `/api/fis/assess`(先唔傳 excluded)→ 顯示候選成因 + 各自 Layer3 test。
- [ ] Step 4 教練睇 Layer3,剔除唔成立成因(checkbox)→ 重 call assess(傳 excluded)→ 顯示**方案**:15段訓練次序 + 每段 V片 + T-notes + 安全網 flag。
- [ ] 跟品牌憲法(深海軍藍 #2a3d63 / 金 #ffc845 / 卡片圓角 / 安全聲明用 [!])。

## A3. 批量補其餘 18 外觀
- [ ] 頭前引 pipeline 測通後,chat 逐批提供外觀 2-19 嘅 causes JSON,填入 `fis_engine.json`。

## ✅ 階段 A 驗證 checklist（iPhone 截圖）
- [ ] 揀「頭前引」→ 出到候選 8 成因 + Layer3 test
- [ ] 剔除 2 個 → 方案次序有變(加總正確)
- [ ] 方案顯示對應 V片(如 DFL中 → V3/V4)
- [ ] 頭前引一定見到神經徵狀轉介安全網
- [ ] 全程冇存 D1(純引擎)

---

# 階段 B — 記錄追蹤（③Layer3記錄 ⑤雙軌baseline ⑥re-test）

> **階段 A 測通後先起。** 完成定義:教練存一次評估(含 Layer3 剔除結果 + 雙軌 baseline)入 D1,之後可加 re-test,對比 baseline 睇進度。

## B0. D1 新 table（Claude Code, wrangler）

> **雙軌設計 = 結構化評分(1-5) + 文字補充 並存**。Signal1 = 學生主觀 feel;Signal2 = 教練客觀觀察。re-test 對住 baseline **同一 `target_action`** 比。
> 落地 = `migrations/0006_fis_assessments.sql`,`CREATE TABLE IF NOT EXISTS`,絕不 DROP/ALTER 現有表。**先 local sandbox 驗,remote 零改動**:`wrangler d1 migrations apply fis-db --local`。

```sql
-- 一次完整評估(baseline)
CREATE TABLE IF NOT EXISTS fis_assessments (
  id TEXT PRIMARY KEY,                  -- asm_xxx
  student_id TEXT NOT NULL,             -- → users.id
  coach_id TEXT NOT NULL,
  appearance_ids TEXT NOT NULL,         -- JSON array
  active_cause_ids TEXT NOT NULL,       -- JSON array(剔除後成立成因 = ③Layer3 結果)
  segment_scores TEXT NOT NULL,         -- JSON(15段加總)
  training_order TEXT NOT NULL,         -- JSON
  target_action TEXT,                   -- 對應動作(高位下拉/推類/RDL/自訂),可 NULL
  baseline_student_score INTEGER,       -- ⑤ Signal1 學生主觀 1-5,可 NULL
  baseline_student_note TEXT,           -- ⑤ Signal1 文字補充,可 NULL
  baseline_coach_score INTEGER,         -- ⑤ Signal2 教練客觀 1-5,可 NULL
  baseline_coach_note TEXT,             -- ⑤ Signal2 文字補充,可 NULL
  created_at INTEGER NOT NULL
);

-- re-test(一個 assessment 對多次;對住 baseline 同一 target_action 比)
CREATE TABLE IF NOT EXISTS fis_retests (
  id TEXT PRIMARY KEY,                  -- rt_xxx
  assessment_id TEXT NOT NULL,          -- → fis_assessments.id
  retest_student_score INTEGER,         -- ⑥ Signal1 學生主觀 1-5
  retest_student_note TEXT,             -- ⑥ Signal1 文字補充
  retest_coach_score INTEGER,           -- ⑥ Signal2 教練客觀 1-5
  retest_coach_note TEXT,               -- ⑥ Signal2 文字補充
  verdict TEXT,                         -- 兩軌改善 / 教練睇到學生feel唔到(仍進步) / 兩軌都冇(重判成因)
  created_at INTEGER NOT NULL
);

-- 查詢索引(B1 用:按學員列評估、按評估列 re-test 時序)
CREATE INDEX IF NOT EXISTS idx_fis_assessments_student ON fis_assessments (student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fis_retests_assessment  ON fis_retests (assessment_id, created_at);
```
- [x] 寫 migration `migrations/0006_fis_assessments.sql`(`CREATE TABLE IF NOT EXISTS` + 2 index)。
- [x] **local sandbox apply 驗通**(`--local`,remote 零改動);remote apply 等驗咗先。
- [ ] 確認唔污染現有 users/fascia_tests/progress_logs 等 table。

## B1. Worker API — 記錄(Claude Code)
- [ ] `POST /api/fis/assessment/save` — 存一次評估(A 的方案 + 雙軌 baseline)。
- [ ] `GET  /api/fis/assessment/list?student_id=` — 某學員所有評估。
- [ ] `POST /api/fis/retest/save` — 加一次 re-test。
- [ ] `GET  /api/fis/retest/list?assessment_id=` — 某評估所有 re-test(時序)。

## B2. coach.html UI 加(Cursor)
- [ ] 階段 A Step 4 方案下,加「記低呢次評估」表單:雙軌 baseline 兩格(學生 feel / 教練觀察)→ save。
- [ ] 新區塊「進度追蹤」:揀學員 → 列歷史評估 → 入一個評估 → 顯示 baseline + 加 re-test + re-test 時序列表。
- [ ] re-test verdict 三選:兩軌改善 / 教練睇到學生 feel 唔到(仍算進步) / 兩軌都冇(重判成因)。

## ✅ 階段 B 驗證 checklist（iPhone 截圖）
- [ ] 存一次頭前引評估 + 雙軌 baseline → D1 查到 row
- [ ] 同學員加一次 re-test → 對住 baseline 顯示
- [ ] verdict「教練睇到學生 feel 唔到」存到、顯示到(對應 HOW MUCH 軸1b)
- [ ] 換個學員,記錄唔會撈亂

---

## §合規紅線（兩階段都守,6/7/14號）
- 對外/方案文字:只准 發力感/連結感/控制/對稱/體態/動作品質;**禁** 醫好/根治/矯正/止痛/保證成效。
- 神經 claim(臂神經叢/神經傳導/抓握力)**禁入**任何 UI 文字 —— 軟化成「動作感受/舒適度」。
- 安全網 flag 必須喺頭前引方案顯示。
- 每個 AI/方案輸出底加:`[!] 以下屬教育性參考,並非醫療診斷。如有疼痛請先諮詢醫生。`

## engine data 來源
`fis_engine.json` 內容 = `FIS_57_full_merged.md`(116成因 + 權重)結構化。抽取由 chat 協助逐外觀出 JSON,Claude Code 唔自行作。video_map 來自 `FIS_15seg_to_video_map.md`。
