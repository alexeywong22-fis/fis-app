# FIS PWA — 專案上下文 CONTEXT

> ⚠️ **每次開新 session，請先讀取本檔案再開始工作。**
> 本檔案記錄專案架構、進度、待辦。最後更新：**2026-06-12**

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
| `404d584` | **報告「訓練起點」copy 動態化**（index.html）：原本顯示後端 `recommendations.startingPoint`（AI 跟 prompt 成日寫「🔴🟡線」即使冇🔴）。改為前端按實際 5 線 tier 計算 override：有🔴→「由🔴／🟡線 Stage 1 起」/ 冇🔴有🟡→「由🟡線 Stage 1 起」/ 全🟢→「全線狀態良好,由🟢線進階動作起」。只 override startingPoint，breathing/trainingPlan 不變 |
| `06f479c` | **Email 帳戶登入 v1（密碼）** — 純 additive，鏡像教練 PBKDF2/session pattern，**全 body-based（零 CORS）**。`migrations/0002_user_accounts.sql`（user_accounts + user_account_sessions，只 CREATE）。worker 新 `/api/account/auth/{register,login,logout,me}`（全 POST body）：register 開放（email unique + 確認 currentUserId 存在）bind `primary_user_id=currentUserId`；login 防枚舉；PBKDF2=100000、token 只存 SHA-256、TTL 30 日。index.html：報告卡後保存卡（未登入先彈）+ 登入/註冊 modal + 登入狀態/登出 + app load `accountSessionCheck`（`fis_account_token`）+ 登入後 `fis_user_id=primary_user_id`（v1 唔 merge）。⚠️ **remote D1 migration 待 Alexey 親手 apply**（local 已試 OK）|
| `418ff46` | **FIS 升級 3 級 grading + 發展中文案**：status 由 2 級→3 級（優先關注🔴/發展中🟡/狀態良好🟢，偏向中間收斂踩界 case）。worker step2 prompt 改 3 級判定 + 🟡→Stage 1 + trainingPlan「任何🔴或🟡→9.3A；全🟢→9.3B」。index.html：`FIS_LINE_COPY` 擴 `{red,mid,green}`、runFisStep3 由 binary `isAlert`→3-way `tier`（pill 3 色 #ff5555/#f0a93b/#44cc88、bar 35/65/90%、CTA 🔴睇通/🟡鞏固/🟢深化）。coach.html 06 pill 加 `.pill-amber`（發展中）|
| `f20c134` | **FIS temperature 0.4→0.1 提升一致性**（fis-worker.js）：同一組相 run 多次側線喺🟢/🔴跳（踩界），因 temp 太高。`callGeminiOnce` 嘅 `temperature` 係**共用**（step1/step2/pain/progress 同一個），降到 0.1（分類任務求 determinism）。`maxOutputTokens`/`thinkingConfig` 保留 |
| `20d3e47` | **FIS 報告加「性別 × 筋膜線」針對文案 + 課程 CTA**（純前端 index.html）：上載頁加 👨/👩 必選掣（`fisGender`，client-only，唔送 Worker/D1），4 張相 AND 揀性別先 enable「開始體態分析」（共用 `fisRefreshStart()`）；`runFisStep3` 逐線 pill 下注入 `FIS_LINE_COPY[線][性別][red/green]` 文案 + 金色 CTA（🔴=睇通原理+第九章精準動作／🟢=深化+進階）。報告卡底已有免責，冇重複。⚠️ 淺前線女綠 paste 又截斷，按鏡像補「…平坦小腹同腹中線線條有底子。」待用戶核對 |
| `3c9a835` | **教練後台 v2 加讀 fascia_tests（FIS 自我檢測）** — 純 additive。修正：FIS 自測寫 `fascia_tests` 但 v2 只讀 `functional_tests` → 教練睇唔到。v2 新增讀 fascia_tests + parse 最近 `ai_parsed`，response 加 key `fasciaSelfAssessment:{total,latestAt,latest,history}`（唔覆蓋 functional/fisSection）；coach.html 加「06 · 筋膜線自我檢測（FIS）」格顯示五大線 status/stage。⚠️ **fascia_tests 五大線欄位只存 stage 數字，status 只喺 `ai_parsed` JSON** |
| `cb54867` | **修 Pages 部署**：repo 有冒號檔名令 Jekyll build fail → 相片版 index.html publish 唔到（實機停舊版）。加 `.nojekyll` + 改走冒號檔名，相片版即上線（線上 curl 實證）|
| `a739876` | **FIS 改相片版（4 張全必需）**：step1 prompt←指令一（4 張靜態觀察+結構化清單，動態標 Stage 2）、step2 prompt←指令二判定邏輯（明顯優先門檻/對照規則/90-90 五規則/未評估）但**維持現有 JSON shape**（fascialLines[5]+recommendations，runFisStep3 報告卡照 render）；移除 step1→step2 的 1500 截斷。前端：`accept="image/*"`、UI 4 張（正/側/背/前彎側面）、夠 4 張先 enable 按鈕、**移除影片抽幀死碼**（extractVideoFrames/videoLabels/hasVideo）、只送 4 張壓縮相。step3 仍 client 報告卡（真 AI 生圖=Stage 1.5）。依據檔 `指令一:二:三.md` |
| `33efed2` | **改善 AI 等待體感**（純前端，4 入口共用 `aiCallWithRetry`）：等待 spinner 文字「AI 分析緊…（今晚 AI 較繁忙，可能要 20–40 秒，請稍候）」、~30s 升級「仲喺度處理，多謝耐心…」；**100s 安全網 AbortController**（≥ 後端 max ~95s，唔殺死遲返嘅成功；curl 實測後端可遲到 36.8s）；4 個 attemptFn 收 signal。唔用短 timeout（避免假失敗）|

---

## 2c. PWA 四項改善（2026-06-12）

| Commit | 內容 |
|---|---|
| `963e21f` | **A · 修主畫面圖示載入慢**：原 `fis-icon.png`（1024²/1.6MB）令 add-to-home 圖示 4–8 秒先出。用 macOS `sips` 縮出 `icon-180/192/512.png`（62KB/70KB/410KB）。`index.html` head：apple-touch-icon→icon-180、icon→icon-192、manifest 入 link。`manifest.json`：`start_url`/`scope` 改**相對 `.`**、icons 換細檔（192/512 any + 512 maskable）。⚠️ 機器冇 pngquant/optipng，只 sips |
| `dc93bb1` | **C · 加入主畫面提示偵測 in-app 瀏覽器**：`maybeShowA2HS()` 用 UA 分流——IG/FB/Messenger/Line（`/Instagram\|FBAN\|FBAV\|FB_IAB\|Messenger\|Line\//`）→「右上角 ⋯ → 喺瀏覽器開啟」（內置瀏覽器裝唔到 PWA）;有 `beforeinstallprompt` 且非 iOS→安裝掣;iOS→「分享 ⎙ → 加入主畫面」;其餘 Android→「⋮ → 安裝應用程式」。純前端 |
| `e0ce834` | **B · Service Worker（precache + 安全更新提示）**：新增 `sw.js`——HTML **network-first**（線上永遠攞最新、唔鎖舊版）+ 靜態 **cache-first**;precache app shell（`./` `./index.html` `./manifest.json` 3 icon）;`CACHE='fis-v1'` 版本號 + activate 刪舊 cache + clientsClaim;**唔自動 skipWaiting**（等用家撳掣先換版）;同源先掂、`/api/`＋跨域（Gemini/Worker/字型）唔掂;**全相對路徑**（日後搬 root domain 唔使改）;檔頭留 **kill switch** 註解。`index.html`：`register('./sw.js')` + `updatefound`→`statechange`(installed+有 controller)→彈 `#sw-update-bar`「有新版本，撳一下更新」→撳→`postMessage SKIP_WAITING`→`controllerchange`→reload 一次。⚠️ **Alexey 真機試更新提示** |

> **D · Gemini 錯誤診斷**（無 commit）：fis-step1/2 偶發錯誤確認係 Google 端 **503「high demand」過載**（外部、transient，**唔關 quota／唔係 429**）;查時健康 200。已有 `callGemini` 503/429/網絡 retry 兜住，毋須建 debug。

---

## 2d. 自訂域名上線 + 真機 bug 修復（2026-06-12）

| Commit | 內容 |
|---|---|
| `d40a7f1` | **in-app 偵測加 WeChat / QQ**：`isInApp` regex 加 `MicroMessenger`（WeChat，原本已被 `Messenger` 子字串誤中，今次寫明）、`MQQBrowser` + `QQ/`（手機 QQ 內置瀏覽器）→ 一律「右上角 ⋯ → 喺瀏覽器開啟」。HK share link 常用，避免畀錯指示 |
| `316adc1` | **自訂域名 `fis.alexeywong.com` 上線**：加 `CNAME`（一行 `fis.alexeywong.com`）放 repo 根 = Pages source（deploy-from-branch，Actions 只部署 worker、唔掂 Pages，唔會洗走）。DNS（systemdns.com 託管）`CNAME → alexeywong22-fis.github.io → Pages IP 185.199.108-111.153`，全相對路徑搬根域名零改動。GitHub 自動簽 Let's Encrypt，實測 `HTTP/2 200` + serve FIS app + `http→301→https`（Enforce HTTPS 已剔）。⚠️ **Worker `API_BASE`（workers.dev）係另一域名、唔受影響;唔好掂 worker** |
| `267c50f` | **真機 6 項修復**（純前端 + sw bump）：🔴**A 學員名永遠「載入中」**——`initUser` 由 script-eval 移到 **DOMContentLoaded 後**（太早 call 會撞 SW install 令首次 fetch 失敗 → 卡死;browser tab 都中，非 standalone-only）+ 8s timeout(AbortController) + 重試最多 3 次 + 成功保證 `setupUsernameEditor()` re-render。🔴**B 登入錯密碼卡「處理緊…」**——`accountSubmit` fetch 加 **15s timeout**（永遠唔 hang）+ AbortError→「連線逾時」+ 401 文案改**「電郵或密碼錯誤」**。🟢 FIS loading「多謝耐心」→「多謝耐心等候」。🟡**報告卡標題置中**——header flex 左 `logoSlot` `display:none`（0 寬）右 `rightPad` 120px 令標題偏左 ~60px;`logoSlot` 改 `visibility:hidden` 保留 120px → 真置中。① 字體加 `preconnect`（googleapis+gstatic）減 FOUT。🧹 `sw.js` CACHE **fis-v2→fis-v3** 逼真機攞新版。**診斷實證**：init 200 / login 401 / preflight 204 / live==local，後端 100% 健康，bug 全 client 端（init 時序 race）|

> ⚠️ **後端全程冇改**（依 launch 前唔掂 worker 原則）：以上真機修復全部係 `index.html` + `sw.js`。

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
- [ ] **Gemini model fallback（Stage 1.5，public 推之前先加）**：⚠️ 而家**故意唔加** model fallback（保 FIS 判定一致性 —— 換 model 會令五大線分級漂移）。public launch 前先加：屆時實測幾個 candidate fallback model（例如 `gemini-2.0-flash` 等），揀**對五大線分級漂移最細**嗰個做 503/429 兜底，再上。原則同 `f20c134`（temp 0.1 求 determinism）一致：寧可短暫 503 都唔好靜靜換 model 搞到結果跳。
- [ ] **教練 auth Stage 2**：coach.html 接新 `/api/coach/auth/login`（存 token 唔存密碼）、保護頁面用 `/me` 驗 token；`corsHeaders()` 加 `Authorization`；之後逐步淘汰舊 `env[username]` 共享密碼登入。
- [ ] 教練 auth 加強（按需）：admin 管理教練 UI、session 撤銷/列表、登入失敗 rate-limit；hash 升級 WASM argon2/bcrypt（已留 `hash_version`）。
- [ ] **清 `handleFisStep3` 死碼（Stage 2，launch 前唔好掂 worker）**：`fis-worker.js:466-475` 個 handler + router `path === '/api/fis-step3'`（line 96-97）。前端 `runFisStep3()`（"生成視覺化圖片" 掣）係 client 自己 render 報告卡，從來冇 fetch `/api/fis-step3`，個 response `imageUrl` 寫死 `https://…github.io/fis-app/fis-bg.png`（全 repo 唯一寫死 `/fis-app/` 嘅實際 code）永遠冇人用 → 死碼。搬 root domain **零影響**，所以拖到 Stage 2 清，避免 launch 前重新部署 worker。

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
