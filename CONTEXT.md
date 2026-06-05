# FIS PWA — 專案上下文 CONTEXT

> ⚠️ **每次開新 session，請先讀取本檔案再開始工作。**
> 本檔案記錄專案架構、進度、待辦。最後更新：**2026-06-05**

---

## 1. 項目架構

### 前端（PWA · 靜態檔案）
| 檔案 | 用途 |
|---|---|
| `index.html` | 主應用：FIS 筋膜線自我檢測、進步追蹤（DATA 日誌）、痛點診斷（RX）、熱身、學員名稱 inline edit |
| `coach.html` | 教練後台「上帝視角」：學員列表、體態相片對比、發力感趨勢、痛點熱點、每週自評趨勢、Functional 測試歷史 |
| `progress-hub.html` | 進度中心頁（由主頁「進步追蹤」入口連去） |
| `manifest.json` | PWA manifest |
| 圖片 | `fis-icon.png`、`fis-bg.png`、`body.png`、`body2.png` 等 |

- 前端用原生 JS（無框架），單一 `<script>` block，平面 scope。
- `API_BASE = https://fis-app.alexeywong22.workers.dev`
- 用戶身份：匿名 `localStorage.fis_user_id`，開機 call `/api/user/init`。

### 後端（Cloudflare Worker）
- 檔案：`fis-worker.js`（ES module，`export default { fetch }`）
- 部署網址：`https://fis-app.alexeywong22.workers.dev`
- Worker 名稱：`fis-app`
- 主要路由：
  - 用戶：`/api/user/init`、`/api/user/update-name`、`/api/user/check-progress`
  - AI 分析：`/api/fis-step1`（相片→體態分析）、`/api/fis-step2`（→JSON報告）、`/api/fis-step3`、`/api/progress`（訓練後分析）、`/api/pain`（痛點診斷）
  - 儲存：`/api/progress/save`、`/api/progress/history`、`/api/pain/save`、`/api/functional/save`、`/api/weekly/save`、`/api/fascia-test/save`、`/api/submit-log`
  - 教練：`/api/coach/login`、`/api/coach/users`、`/api/coach/user-summary`、`/api/coach/user-summary-v2`

### 數據庫（Cloudflare D1，binding `env.DB`）
表：`users`、`progress_logs`、`functional_tests`、`pain_diagnoses`、`weekly_assessments`、`fascia_tests`

### AI 引擎
- Google **Gemini `gemini-2.5-flash`**（`callGemini()`，v1 generateContent）
- Secret：`env.GEMINI_API_KEY`
- ⚠️ 注意：gemini-2.5-flash 屬 thinking model；偶爾返 503（高需求）需容錯處理。

### 認證 / Secrets
- 教練登入：username + password，password 存為 secret `env[username]`（例如 `env['alexeywong22']`）。
- Secrets（`GEMINI_API_KEY` + 各教練密碼）設於 Cloudflare，**跨部署自動保留**，唔寫入 repo。

---

## 2. 今日已完成功能（2026-06-05）

| Commit | 內容 |
|---|---|
| `5d02c83` | **coach.html**：weekly assessments 加入「每週自評趨勢」柱狀圖（1–10 分）＋「FIS Functional 測試歷史」（單腳平衡趨勢圖 + 詳細記錄表） |
| `66f0e3c` | **index.html bug fix**：`runFisStep2()` 缺 `data.error` 檢查，API 503/空結果時仍扮「分析完成」令 Step 3 報告卡冇內容；加入錯誤守衛、清理重複賦值 |
| `c110ba9` | 移除多餘嘅 `index .html`（帶空格備份檔） |
| `790fede` | **index.html**：主頁 home-header 加入學員名稱 **Inline Edit**（tap 改名、Enter 儲存/Esc 取消、前端驗證 `^[a-zA-Z0-9_]{3,20}$`、連 `/api/user/update-name`） |
| `d986136` | **fis-worker.js + index.html**：`/api/user/init` 改為回傳用戶 `name`；前端 init 存入 localStorage 並即時 re-render 名稱 chip ⚠️**未部署** |
| `926788f` | 加入 Wrangler 部署設定：`wrangler.toml`、`package.json`、`.nvmrc`、`.gitignore`、`DEPLOY.md`；移除已追蹤嘅 `.DS_Store` |

---

## 3. 待完成功能 / 待辦

### 🔴 高優先（阻塞中）
- [ ] **部署 `fis-worker.js` 到 Cloudflare** —— `d986136`（init 回傳 name）改動**未上線**，舊用戶換裝置/清 cache 後名稱仍會顯示 placeholder，要部署後先生效。
- [ ] **填 `wrangler.toml` 嘅 D1 binding** —— `database_name` / `database_id` 仍係 placeholder，未填唔可以 `npm run deploy`（否則 worker 連唔到 D1）。
  - 攞值：`npm run d1:list`（需 Node 22 + `npx wrangler login`）。
- [ ] **確認 secrets 係 Secret 而非明文 var**（`GEMINI_API_KEY` + 教練密碼），否則 wrangler deploy 會洗走。

### 部署環境注意
- 本機 Node 為 **v20.11.0**，但 wrangler v4 需 **Node ≥ 22**；本機無 nvm/brew。
- 部署步驟見 `DEPLOY.md`（裝 Node 22 → `npm install` → `npx wrangler login` → 填 D1 id → `npm run deploy`）。
- ⚠️ Claude 喺現有環境**無法代為部署**（Node 版本 + 需互動式瀏覽器授權 + 無 CF 憑證）。

### 💡 未來可考慮
- [ ] AI 503 容錯：`/api/progress`、`/api/pain`、`/api/fis-step2` 加 retry 機制。
- [ ] 名稱驗證放寬支援中文（目前 worker 限 `^[a-zA-Z0-9_]{3,20}$`）。

---

## 4. 開發慣例
- 本專案為個人 solo repo，直接 commit/push 到 `main`（無 PR 流程）。
- Git remote：`https://github.com/alexeywong22-fis/fis-app.git`
- Commit message 用繁體中文（廣東話書面語）。
- 改完前端必驗證單一 `<script>` block 語法；改完 worker 用 `node --check`（當 ESM）驗證。
- Worker 部署：**唔好用無 binding 設定嘅 wrangler 硬 deploy**，會洗走 D1 / secrets。
