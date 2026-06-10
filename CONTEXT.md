# FIS PWA — 專案上下文 CONTEXT

> ⚠️ **每次開新 session，請先讀取本檔案再開始工作。**
> 本檔案記錄專案架構、進度、待辦。最後更新：**2026-06-10**

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
| `414546c` | **三項 UX**：①新用戶引導頁 `#onboarding`（3 共鳴問題 + FIS 介紹，`fis_onboarded` 控制，首開→引導→disclaimer）②主頁 + progress-hub 四格 `fadeInUp` 彈出動畫（0.35s、cubic-bezier(0.2,0,0.2,1.2)、每格錯 0.08s）③加入主畫面 banner `#a2hs-banner`（完成首次自我檢測 `fis_first_assess` 後顯示，iOS 指示／Android `beforeinstallprompt`，`fis_a2hs_done` 唔重複）|
| `f19d6dd` | **服務條款 `#terms` + 私隱政策 `#privacy`**（獨立 screen，合 HK PDPO + GDPR）：FIS 筋膜整合系統品牌、Alexey Wong 服務提供者、數據收集、AI／醫療免責、退款政策 placeholder；disclaimer + home footer 入口（`data-legal` / `openLegal`）。聯絡電郵已填 `alexeywong22@gmail.com`，**仍待補退款條款** |
| `ad7dcb0` | 法律頁聯絡電郵填 `alexeywong22@gmail.com`（3 處）；**SKool 加開關 `SKOOL_ENABLED=false`** 暫時隱藏主頁卡（`btn-skool`）同報告卡 CTA（`fis-skool-cta`）—— 日後開 SKool 設 `true` + 填 `SKOOL_URL` 即可開返 |
| `af0d20a` | **coach.html 改 FIS 品牌色（方案C）**：`:root` 換深海軍藍 `#2a3d63` + 金 `#ffc845`（新增 `--cream`）；統一金色 rgba `255,200,69`、金底深字 `#16223f`、移走紫色 `#a78bfa`→金。純顏色，冇郁邏輯 |
| `5f63e90` | **教練多帳號認證 Stage 1**：新增 `migrations/0001_coaches.sql`（`coaches` + `coach_sessions`，只 CREATE）+ 4 個新 endpoint `/api/coach/auth/{register,login,logout,me}`（PBKDF2+每人 salt、DB opaque token 存 SHA-256、12h）。100% 新增，現有 `/api/coach/*` + coach.html 零改動 |
| `247a2ee` | 教練認證 PBKDF2 iterations 改 **100000**（Cloudflare Workers 硬上限，210000 被拒）|
| `527c7f2` | **FIS AI 檢測 503 容錯**：後端 `callGemini` 拆 `callGeminiOnce`+silent retry wrapper（只 503/429/網絡重試，最多 3 次指數退避 600ms→1.2s→2.4s+jitter，per-fetch 15s+總 25s budget；400/401/403 即時返）。覆蓋 fis-step1/2 + pain + progress（同一 `callGemini`），prompt/免責/handler 零改。前端 step1/2 loading 改轉圈 spinner + 失敗顯示溫和訊息「AI 分析服務暫時繁忙」+ 再試掣 |
| `446797d`+`b892da4` | **修 AI 超時 + RX 改名**：`callGemini(timeoutMs)` 動態 timeout（fis-step1 圖片=60s、step2/pain/progress=30s）；`generationConfig` 加 `thinkingConfig:{thinkingBudget:0}`（**v1 唔收 400→自動 fallback v1beta+thinkingBudget0**，已驗證）；TOTAL_BUDGET 按 timeoutMs 動態計；重試分類 503/429/網絡=3 次、timeout(abort, `ctrl.signal.aborted`)=2 次。RX UI：底部導覽「診斷」→「建議」、按鈕/標題「診斷」→「建議」（免責/路徑/RX/s-title 不變）。curl /api/pain 驗證 HTTP 200 |
| `577fc70` | **「診斷」改名收尾 + AI 失敗訊息統一**：HOME 卡「03-診斷」→「建議」/「訓練痛點診斷」→「訓練痛點分析」、RX 標題「痛點診斷」→「痛點分析」（5 處免責聲明保留）。新增 `aiCallWithRetry()`：失敗 →「自動重試緊…」→ 隔 3 秒重試 1 次 → 仍失敗 →「⚠️ AI 服務一時繁忙（唔係 app 壞咗），請撳再試」+ 再試掣；RX 結果區加再試掣；畫面零技術字眼。覆蓋 step1/2 + pain + progress。純前端 |
| `a739876` | **FIS 改相片版（4 張全必需）**：step1 prompt←指令一（4 張靜態觀察+結構化清單，動態標 Stage 2）、step2 prompt←指令二判定邏輯（明顯優先門檻/對照規則/90-90 五規則/未評估）但**維持現有 JSON shape**（fascialLines[5]+recommendations，runFisStep3 報告卡照 render）；移除 step1→step2 的 1500 截斷。前端：`accept="image/*"`、UI 4 張（正/側/背/前彎側面）、夠 4 張先 enable 按鈕、**移除影片抽幀死碼**（extractVideoFrames/videoLabels/hasVideo）、只送 4 張壓縮相。step3 仍 client 報告卡（真 AI 生圖=Stage 1.5）。依據檔 `指令一:二:三.md` |
| `33efed2` | **改善 AI 等待體感**（純前端，4 入口共用 `aiCallWithRetry`）：等待 spinner 文字「AI 分析緊…（今晚 AI 較繁忙，可能要 20–40 秒，請稍候）」、~30s 升級「仲喺度處理，多謝耐心…」；**100s 安全網 AbortController**（≥ 後端 max ~95s，唔殺死遲返嘅成功；curl 實測後端可遲到 36.8s）；4 個 attemptFn 收 signal。唔用短 timeout（避免假失敗）|

---

## 2b. GitHub Actions 自動部署（2026-06-06 設定完成）

- `.github/workflows/deploy.yml`（**經 GitHub 網頁建立**，commit `9aa53f3`）：push 到 `main` → `cloudflare/wrangler-action@v3` 自動部署 fis-app worker。✅ 已驗證綠剔（Deploy Worker #6）。
- GitHub repo secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（已設）。
- **以後改 `fis-worker.js` push 上 main 就自動部署 worker**；前端（index/coach 等）一直由 **GitHub Pages** 自動部署。
- ⚠️ 踩過嘅坑：①檔名要 `.github/workflows/`（開頭有點）②GitHub 網頁編輯器貼上會自動加縮排令 YAML 失效 → 用 **Cmd+A → Shift+Tab** 整段退格修正 ③本機 git token 冇 `workflow` scope，**推唔到 workflow 檔**，要喺 GitHub 網頁改。
- ⚠️ **Pages 坑（cb54867）**：repo 有**冒號檔名**（`指令一:二:三.md`）會令 Pages 預設 **Jekyll build fail** → 新 commit publish 唔到、實機停留舊版（即使本機/遠端 SHA 已新）。已加 **`.nojekyll`**（Pages 直接 serve 靜態、跳過 Jekyll）+ 改走冒號檔名。**以後唔好放怪檔名／保持 `.nojekyll`**。診斷法：`curl 線上 index.html | grep 新字串` 對比本機。

---

## 2c. 教練多帳號認證 Stage 1（2026-06-10 完成 ✅）

**目標**：由單一共享密碼登入，升級做「多教練 email+密碼帳號 + admin/coach 角色」。

- **新表**（remote fis-db 已建，閘門 2 驗過現有 7 表零改動）：
  - `coaches`：id / email(unique) / password_hash / salt / iterations / hash_version / role(admin|coach) / name / status / created_at
  - `coach_sessions`：token_hash(PK, = SHA-256(raw token)) / coach_id / created_at / expires_at
- **新 endpoint**（純新增，現有 `/api/coach/login`、`/users`、`user-summary(-v2)`、coach.html 都**冇郁**）：
  - `POST /api/coach/auth/register`（admin token 或 bootstrap_key〔coaches 表空時〕授權）
  - `POST /api/coach/auth/login`（email+密碼 → 12h opaque token）
  - `POST /api/coach/auth/logout`、`GET /api/coach/auth/me`
- **密碼**：PBKDF2-SHA256、每人 16-byte 隨機 salt、`iterations=100000`（Workers 硬上限）、逐行存 `iterations`+`hash_version`，永不明文。
- **Session**：32-byte 隨機 token，DB 只存 `SHA-256(token)`，前端只擺 token（唔擺密碼），Bearer header。
- **Admin seed 完成**：`coach_ae240cddf53d47c6`、email `alexeywong22@gmail.com`、role **admin**（2026-06-10 經 bootstrap_key seed，HTTP 200）。
- **Bootstrap 已自動關閉**：`coaches` 表非空後，register 帶 bootstrap_key 一律回 403。
- **備份**：migration 前 `wrangler d1 export` → `backup-fis-db-20260606.sql`（已 gitignore，唔入庫）。
- ⚠️ **未做（Stage 2）**：coach.html 仲用緊舊單一密碼登入；未接新 auth。`corsHeaders()` 仲只准 `Content-Type`，Stage 2 接 coach.html（跨站 Bearer）要加 `Authorization`。

---

## 3. 待完成功能 / 待辦

### ✅ 已解決（原阻塞項）
- [x] 部署 `fis-worker.js` 到 Cloudflare（init 回傳 name 已上線）。
- [x] 填 `wrangler.toml` D1 binding（account_id + `fis-db` / `6bf1dc99-...`）。
- [x] 確認 secrets 全部係 Secret（`alexeywong22`、`GEMINI_API_KEY`、`FAL/OPENAI/OPENROUTER_API_KEY`），跨部署自動保留。

### 💡 未來可考慮
- [x] AI 容錯 retry：前端 `runFisStep2`/`analyzePain`/`analyzeProgress` 各 1 次重試；**後端 `callGemini` 亦加 silent retry（503/429/網絡，3 次指數退避+timeout）覆蓋 fis-step1/2+pain+progress**（`527c7f2`）。
- [ ] 名稱驗證放寬支援中文（目前 worker 限 `^[a-zA-Z0-9_]{3,20}$`）。
- [ ] **將 `SKOOL_URL`（index.html）由 `YOUR_SKOOL_URL` 換成真實 SKool 連結**（報告卡 CTA + 主頁卡共用）。
- [ ] **教練 auth Stage 2**：coach.html 接新 `/api/coach/auth/login`（存 token 唔存密碼）、保護頁面用 `/me` 驗 token；`corsHeaders()` 加 `Authorization`；之後逐步淘汰舊 `env[username]` 共享密碼登入。
- [ ] 教練 auth 加強（按需）：admin 管理教練 UI、session 撤銷/列表、登入失敗 rate-limit；hash 升級 WASM argon2/bcrypt（已留 `hash_version`）。

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
