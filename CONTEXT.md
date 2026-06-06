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
| `cbea2c2` | 新增 `CONTEXT.md`（專案上下文）+ `CLAUDE.md`（session 開始自動指引讀 CONTEXT.md） |
| `4ca52d2` | CONTEXT.md 加入「收尾時自動更新」開發習慣 |
| `da3e995` | 改用 wrangler 3.x（本機 Node 20 可直接部署，避開 Node 22）+ 加入 package-lock.json |
| `19a55dc` | **完成 Wrangler 自動部署設定並首次部署上線** — 填好 `wrangler.toml`（account_id + D1 `fis-db`），用 API token 部署，`/api/user/init` 返 name 已生效（Version `b93f5cbb`）|
| `6ccbc1d` | **index.html 三項優化**：①warmup 頁頂加醫療免責 `.dbox`（同 RX 同款）②home-sub 動態顯示「歡迎，[名字]」（有 `fis_username` 時，經 `updateHomeSub()`）③`runFisStep2` + `analyzePain` 加自動重試一次（失敗等 2 秒重試，第二次先報錯）|
| `0698c0f` | **FIS 影片改抽 10 幀（10%-100%）送 Gemini**：`extractVideoFrames` 由 3 幀升 10 幀，只送截圖永不送影片（根治 error 400），100% clamp + 15 秒 watchdog |
| `e02989c` | `analyzeProgress` 加自動重試一次（與 runFisStep2 / analyzePain 一致，拆出 `attemptProgress()`）|
| `ddfd4fd` | **SKool 入口**：報告卡下面加「想知解決方法？」CTA（`fis-skool-cta`）+ 主頁全寬 SKool 課程卡（`btn-skool`），共用 `SKOOL_URL='YOUR_SKOOL_URL'` placeholder 與 `openSkool()` |
| `8a8fa34` | **FIS 圖片上載前自動壓縮 + HEIC 提示**：新增 `compressImage()`（長邊 1200px、JPEG 80%，參考 progress-hub）取代直接 readAsDataURL；新增 `isHeic()`，選檔即時警告 + 分析時跳過 HEIC 並提示轉 JPG/PNG |
| `ab959e8` | **修復改名失敗**：名稱 chip 喺 `FIS_USER_ID` 未初始化前顯示「載入中…」且不可改，init 完成後 re-render 啟用；`doSave` 加 userId 保險。`manifest.json` name 改「FIS 綜合系統」 |
| _(本次)_ | **三項 UX**：①新用戶引導頁 `#onboarding`（3 共鳴問題 + FIS 介紹，`fis_onboarded` 控制，首開→引導→disclaimer）②主頁 + progress-hub 四格 `fadeInUp` 彈出動畫（0.35s、cubic-bezier(0.2,0,0.2,1.2)、每格錯 0.08s）③加入主畫面 banner `#a2hs-banner`（完成首次自我檢測 `fis_first_assess` 後顯示，iOS 指示／Android `beforeinstallprompt`，`fis_a2hs_done` 唔重複）|

---

## 3. 待完成功能 / 待辦

### ✅ 已解決（原阻塞項）
- [x] 部署 `fis-worker.js` 到 Cloudflare（init 回傳 name 已上線）。
- [x] 填 `wrangler.toml` D1 binding（account_id + `fis-db` / `6bf1dc99-...`）。
- [x] 確認 secrets 全部係 Secret（`alexeywong22`、`GEMINI_API_KEY`、`FAL/OPENAI/OPENROUTER_API_KEY`），跨部署自動保留。

### 💡 未來可考慮
- [x] AI 容錯 retry：`runFisStep2`、`analyzePain`、`analyzeProgress` 三個都已加前端重試一次。
- [ ] 名稱驗證放寬支援中文（目前 worker 限 `^[a-zA-Z0-9_]{3,20}$`）。
- [ ] **將 `SKOOL_URL`（index.html）由 `YOUR_SKOOL_URL` 換成真實 SKool 連結**（報告卡 CTA + 主頁卡共用）。

### 部署資訊 / 慣例
- **部署指令**：`export CLOUDFLARE_API_TOKEN=<token> && npm run deploy`（或 `npx wrangler deploy`）。
- 本機用 **wrangler 3.114**（Node v20.11 可行，毋須 Node 22）。
- 認證：`wrangler login` 互動瀏覽器授權喺呢部機試過會 timeout；改用 **API token**（`CLOUDFLARE_API_TOKEN` 環境變數）較可靠。token 唔好寫入 repo。
- npm cache 有 root-owned 檔，`npm install` 要加 `--cache /tmp/fis-npm-cache` 繞過（或 `sudo chown -R 501:20 ~/.npm` 永久修）。
- account_id：`61d31020d4d776c88faeb05bd53c19bf`；D1 `fis-db`：`6bf1dc99-d448-4e1a-8267-64f7ed8198a4`。

---

## 4. 開發慣例
- 本專案為個人 solo repo，直接 commit/push 到 `main`（無 PR 流程）。
- Git remote：`https://github.com/alexeywong22-fis/fis-app.git`
- Commit message 用繁體中文（廣東話書面語）。
- 改完前端必驗證單一 `<script>` block 語法；改完 worker 用 `node --check`（當 ESM）驗證。
- Worker 部署：**唔好用無 binding 設定嘅 wrangler 硬 deploy**，會洗走 D1 / secrets。

### 📝 收尾習慣（每次 session 結束前）
完成有意義嘅改動、收尾之前，**自動更新本檔案 `CONTEXT.md`**，毋須等用戶開口：
1. 更新頂部「最後更新」日期。
2. 將今次完成嘅嘢加入「§2 今日已完成功能」（附 commit hash）。
3. 將已解決嘅項目喺「§3 待完成」剔走，並補上新發現嘅待辦。
4. 連同其他改動一齊 commit / push。
