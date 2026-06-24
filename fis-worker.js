// fis-worker.js — Cloudflare Worker for FIS App
// Accepts FormData (files) from frontend, converts to base64, sends to Gemini
import { DurableObject } from 'cloudflare:workers';

export class GeminiRelay extends DurableObject {
async fetch(request) {
if (request.method !== 'POST') {
return new Response('Method not allowed', { status: 405 });
}
const apiKey = this.env.GEMINI_API_KEY;
if (!apiKey) {
return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
}
let body;
try {
body = await request.json();
} catch (err) {
return Response.json({ error: 'Invalid JSON: ' + err.message }, { status: 400 });
}
const { parts, timeoutMs } = body;
if (!parts || !Array.isArray(parts)) {
return Response.json({ error: 'Missing parts' }, { status: 400 });
}
const result = await relayGeminiFetch(parts, apiKey, timeoutMs || 30000);
console.log('[gemini]', { via: 'do-relay', ok: !result.error, cfg: result.cfg || null });
return Response.json(result);
}
}

export default {
async fetch(request, env) {
// ── CORS preflight ──────────────────────────────────────────────────────
if (request.method === 'OPTIONS') {
return new Response(null, { status: 204, headers: corsHeaders() });
}
if (request.method !== 'POST' && request.method !== 'GET') {
return jsonResponse({ error: 'Method not allowed' }, 405);
}
const url = new URL(request.url);
const path = url.pathname;
try {
if (path === '/api/fascia-test/save') {
return handleFasciaTestSave(request, env);
}
if (path === '/api/submit-log' && request.method === 'POST') {
return handleSubmitLog(request, env);
}
if (path === '/api/user/update-name' && request.method === 'POST') {
return handleUpdateUsername(request, env);
}
if (path === '/api/coach/login' && request.method === 'POST') {
return handleCoachLogin(request, env);
}
if (path === '/api/coach/users' && request.method === 'POST') {
return handleCoachUsers(request, env);
}
// ── Stage 1: 新教練 email+密碼認證（純新增，唔影響上面舊 coach endpoint）──
if (path === '/api/coach/auth/register' && request.method === 'POST') {
return handleCoachAuthRegister(request, env);
}
if (path === '/api/coach/auth/login' && request.method === 'POST') {
return handleCoachAuthLogin(request, env);
}
if (path === '/api/coach/auth/logout' && request.method === 'POST') {
return handleCoachAuthLogout(request, env);
}
if (path === '/api/coach/auth/me' && request.method === 'GET') {
return handleCoachAuthMe(request, env);
}
// ── 用戶 email 帳戶登入 v1（密碼）：全 body-based，零 CORS 改動。鏡像教練 PBKDF2/session pattern ──
if (path === '/api/account/auth/register' && request.method === 'POST') {
return handleAccountRegister(request, env);
}
if (path === '/api/account/auth/login' && request.method === 'POST') {
return handleAccountLogin(request, env);
}
if (path === '/api/account/auth/logout' && request.method === 'POST') {
return handleAccountLogout(request, env);
}
if (path === '/api/account/auth/me' && request.method === 'POST') {
return handleAccountMe(request, env);
}
// Email OTP（無密碼登入 + 密碼重設），body-based，跟 account 同一 pattern
if (path === '/api/account/otp/request' && request.method === 'POST') {
return handleOtpRequest(request, env);
}
if (path === '/api/account/otp/verify' && request.method === 'POST') {
return handleOtpVerify(request, env);
}
if (path === '/api/account/password/reset' && request.method === 'POST') {
return handlePasswordReset(request, env);
}
// Admin：設課程權益（coach_key gated，同 /api/coach/* 一致）
if (path === '/api/admin/set-entitlement' && request.method === 'POST') {
return handleAdminSetEntitlement(request, env);
}
if (path === '/api/weekly/save' && request.method === 'POST') {
return handleWeeklySave(request, env);
}
if (path === '/api/functional/save' && request.method === 'POST') {
return handleFunctionalSave(request, env);
}
if (path === '/api/debug/env') {
return jsonResponse({
          hasAlexeywong22: !!env.alexeywong22,
          hasCoachKey: !!env.COACH_SECRET_KEY,
          keys: Object.keys(env)
});
}
if (path === '/api/coach/user-summary') {
return handleCoachUserSummary(request, env);
}
if (path === '/api/progress/history') {
return handleProgressHistory(request, env);
}
if (path === '/api/progress/save') {
return handleProgressSave(request, env);
}
if (path === '/api/pain/save') {
return handlePainSave(request, env);
}
if (path === '/api/user/init') {
return handleUserInit(request, env);
}
if (path === '/api/fis-step1') {
return await handleFisStep1(request, env);
}
if (path === '/api/fis-step2') {
return await handleFisStep2(request, env);
}
if (path === '/api/progress') {
return await handleProgress(request, env);
}
if (path === '/api/pain') {
return await handlePain(request, env);
}
if (path === '/api/fis-step3') {
return await handleFisStep3(request, env);
}
if (path === '/api/coach/user-summary-v2' && request.method === 'POST') {
return handleCoachUserSummaryV2(request, env);
}
if (path === '/api/coach/daily' && request.method === 'POST') {
return handleCoachDaily(request, env);
}
if (path === '/api/user/check-progress' && request.method === 'GET') {
return handleCheckProgress(request, env);
}
return jsonResponse({ error: 'Route not found: ' + path }, 404);
} catch (err) {
return jsonResponse({
        error: 'Worker internal error',
        message: err.message,
        stack: err.stack || null
});
}
}
};

async function handleFisStep1(request, env) {
const GEMINI_API_KEY = env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
}
let body;
try {
body = await request.json();
} catch (err) {
return jsonResponse({ error: 'Failed to parse JSON: ' + err.message }, 400);
}
const images = body.images;
if (!images || !Array.isArray(images) || images.length === 0) {
return jsonResponse({ error: '請上載最少一張圖片進行分析' }, 400);
}
const parts = [];
parts.push({
    text: `【⚠️系統指令：本步驟嚴禁生成任何圖片，只能輸出純文字。】

你現在是一位專業的體態分析教育顧問。

【重要前提】所有資訊屬教育性體態參考，並非醫療診斷或物理治療建議。以「體態特徵」描述，避免診斷性語言。如涉及可能需要醫療介入的情況，建議用戶先咨詢醫療專業人士。
【左右方向約定】全程以「受試者本人的左／右」描述（非畫面左右），請在開頭聲明此慣例。

我已上傳以下 4 張相片（全部必需）：
- 照片一：正面站立
- 照片二：側面站立
- 照片三：背面站立
- 照片四：站姿前彎最低點（側面）—— 用作脊椎屈曲弧度觀察

第〇部分：檔案品質檢查（先做）——逐張（共 4 張）評估是否足以可靠觀察（全身入鏡、光線足、衣著貼身、鏡頭高度與角度合理）。任何相片不足以可靠觀察某項目，請標「此相不足以可靠觀察【該項目】，建議重影」，不要硬估。

觀察總原則：
- 盡量以兩個角度（如正面＋側面、正面＋背面）互相確認；只得一個角度確認 → 標「存疑」。
- 每項附【信心：高／中／低】與【程度：輕微／明顯】。
- 純動態項目本版本不評估，標「未評估（Stage 2）」。

第一部分：靜態關節體態特徵（逐項描述＋信心＋程度）
1. 腳腕／足弓（正面、背面）2. 膝關節靜態對齊（正面；動態內扣屬Stage 2）3. 盆骨前後／左右高低／旋轉（三角度）4. 腰椎弧度／對稱（側面、背面）5. 胸椎弧度／左右對稱／靜態旋轉（側面、背面）6. 頸椎：頭相對肩前後位置（側面）7. 肩胛骨與肩帶：肩高對稱、肩胛位置（正面、背面）
第二部分：靜態腳趾方向（正面，>15度明顯／5–15度輕微；步態屬Stage 2）
第三部分：呼吸／前彎——照片四作脊椎屈曲弧度靜態觀察（胸椎／腰椎屈曲是否順暢、有否分段僵硬或代償）；呼吸動態屬Stage 2。

第四部分：結構化特徵清單（供指令二讀取，此清單為指令二判定的唯一依據）
格式：每項標【有／無／存疑／未評估(Stage 2)】＋【程度：輕微／明顯】＋【信心：高／中／低】
- 圓肩：
- 頭部前移：
- 骨盆方向：【前傾／中立／後傾】＋是否對稱
- 腰椎弧度偏大：
- 股骨／腳趾向內（靜態，左）：
- 股骨／腳趾向內（靜態，右）：
- 胸椎代償（靜態旋轉／側傾）：
- 骨盆旋轉：
- 骨盆側傾（左右高低）：
- 肩高不對稱：
- 肩胛骨不對稱：
- 足弓特徵：
- 膝關節靜態對齊異常（左）：
- 膝關節靜態對齊異常（右）：
- 步態／左右發力不對稱：未評估（Stage 2）
- 膝關節動態內扣：未評估（Stage 2）
- 單腳站立骨盆動態不穩：未評估（Stage 2）
- 呼吸動態：未評估（Stage 2）

結尾附上：「以上觀察結果屬於教育性體態參考，並非醫療診斷。本版本以靜態相片為主，部分動態項目未評估。如你對自己的身體狀況有任何疑問，建議先咨詢醫生或物理治療師。」

【⚠️再次強調：本步驟禁止生成任何圖片，只允許純文字。】`
});
let imageCount = 0;
for (const raw of images) {
let mimeType = 'image/jpeg';
let base64Data = raw;
if (raw.startsWith('data:')) {
const semicolonIdx = raw.indexOf(';');
const commaIdx = raw.indexOf(',');
if (semicolonIdx !== -1 && commaIdx !== -1) {
mimeType = raw.substring(5, semicolonIdx);
base64Data = raw.substring(commaIdx + 1);
} else {
base64Data = raw.split(',')[1] || raw;
}
}
parts.push({ inlineData: { mimeType, data: base64Data } });
imageCount++;
}
if (imageCount === 0) {
return jsonResponse({ error: '請上載最少一張圖片（jpg/png）進行分析' }, 400);
}
const geminiResult = await callGemini(parts, env, 60000);
if (geminiResult.error) {
// 同一 model retry（503/429/網絡，唔換 model 保 temp:0+seed 一致性）全失敗 → 乾淨 JSON，唔白屏
const busy = geminiResult.retryable || geminiResult.status === 503 || geminiResult.status === 429 || geminiResult.timedOut;
return jsonResponse({ success: false, error: busy ? 'AI_BUSY' : 'AI_ERROR', message: 'AI 暫時繁忙，請稍後再試' }, busy ? 503 : 502);
}
return jsonResponse({ result: geminiResult.text });
}

async function handleFisStep2(request, env) {
const GEMINI_API_KEY = env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
}
const body = await request.json();
const step1Result = body.step1Result || '';
if (!step1Result) {
return jsonResponse({ error: 'Missing step1Result' }, 400);
}
const parts = [{
    text: `你係 FIS 體態特徵訓練系統嘅判定引擎。請直接讀取下面「指令一輸出（含末段結構化特徵清單）」，按規則判定，最後只輸出純 JSON（嚴禁任何其他文字、說明或 markdown）。

指令一輸出：
${step1Result}

【判定規則 — 三級制，偏向中間】
- 教育性訓練參考，非醫療處方。判定 100% 根據清單，嚴禁假設、嚴禁參考任何例子數值。
- 每條線判為四級之一（🔴 / 🟡 / 過渡 / 🟢）：
  · 優先關注(🔴)：明顯弱／有明顯問題（對應特徵「明顯」且兩個相片來源確認）。
  · 發展中(🟡)：唔係明顯一邊、證據混合、接近🔴門檻、僅「輕微」、單一來源、存疑、或因動態未評估而不確定。
  · 過渡(🟡→🟢)：靜態特徵大致達標、明顯偏向良好但仲差少少未完全清楚到位；或真係介乎「發展中」同「良好」之間、唔肯定應落 Stage 1 定 Stage 2。
  · 狀態良好(🟢)：明顯好／清楚全部達標（對應靜態項目全部「無」或清楚未達門檻）。
- ⚠️ 兩條邊界 tie-break（求一致，唔好硬揀）：
  · 下邊界 🔴↔🟡 踩界 → 一律落 🟡（中間夠闊，寧可🟡都唔好勉強二選一）。
  · 上邊界 🟡↔🟢 踩界、或 Stage 1↔Stage 2 唔肯定 → 一律落 過渡，唔好硬跳 🟡 或 🟢。
- ⚠️ 防止濫用「過渡」：過渡只用喺「明顯偏向良好、差少少到位」或「真係 🟡／🟢 之間」。證據仲混合／偏弱／明顯未達標 → 係 🟡（唔係過渡）；明顯清楚全好 → 係 🟢（唔係過渡）。
- 未評估（Stage 2）項目：以可得嘅靜態特徵判定，唔好因動態缺席就當🟢，亦唔好硬當🔴；唔確定就🟡（唔係過渡）。
- 對照規則（讀靜態清單）：
  · 圓肩／頭部前移達門檻 → 深前線、淺前線 偏🔴（僅輕微跡象 → 🟡；完全無 → 🟢）
  · 骨盆前傾／腰椎弧度偏大達門檻 → 深前線、淺背線 偏🔴（同上）
  · 肩高不對稱／肩胛骨不對稱達門檻 → 螺旋線 偏🔴；僅輕微跡象 → 🟡；完全無 → 🟡（⚠️ 螺旋線特例：靜態最高只能評到 🟡，即使完全無不對稱亦唔可以評「過渡」或 🟢。原因：螺旋線係動態旋轉結構，靜態對稱唔等於動態連結良好，真實連結要影片版動態評估先驗證）。
  · 足弓特徵／膝靜態對齊異常達門檻 → 側線 偏🔴（同上）
- 對應到 JSON：🔴 → status「優先關注」、stage「Stage 1」；🟡 → status「發展中」、stage「Stage 1」；過渡 → status「過渡」、stage「Stage 1→2」；🟢 → status「狀態良好」、stage「Stage 2」。
- 90/90 版本：①骨盆完全對稱前傾且無股骨內旋／胸椎代償／骨盆旋轉／側傾 → 標準版；②骨盆中立 → 修改版；③骨盆完全對稱後傾且無上述 → 跳過；④任何骨盆位置只要有股骨內旋／胸椎代償／骨盆旋轉／側傾任一 → 修改版；⑤任何疑問或不清晰（含因動態未評估）→ 修改版。
- 訓練計劃：任何一條 🔴、🟡 或 過渡 → 「FIS鋼鐵解鎖(9.3A)」；全部 🟢 → 「FIS奇才通關(9.3B)」。

只輸出以下 JSON（status 只能「優先關注」「發展中」「過渡」或「狀態良好」；stage 只能「Stage 1」「Stage 1→2」或「Stage 2」）：
{
  "fascialLines": {
    "deepFrontLine": { "status": "...", "stage": "..." },
    "lateralLine": { "status": "...", "stage": "..." },
    "spiralLine": { "status": "...", "stage": "..." },
    "superficialBackLine": { "status": "...", "stage": "..." },
    "superficialFrontLine": { "status": "...", "stage": "..." }
  },
  "recommendations": {
    "breathing": "90/90：[標準版/修改版/跳過]（[簡短原因，30字內]）",
    "trainingPlan": "[FIS鋼鐵解鎖(9.3A) 或 FIS奇才通關(9.3B)]",
    "startingPoint": "相片版評估，動態項目（步態／單腳／呼吸）留待影片版補充；[未全綠→由🔴🟡線 Stage 1 起／全🟢→可由 Stage 2 起]"
  }
}
只輸出 JSON。`
}];
const geminiResult = await callGemini(parts, env, 30000);
if (geminiResult.error) {
// 同一 model retry（503/429/網絡，唔換 model 保 temp:0+seed 一致性）全失敗 → 乾淨 JSON，唔白屏
const busy = geminiResult.retryable || geminiResult.status === 503 || geminiResult.status === 429 || geminiResult.timedOut;
return jsonResponse({ success: false, error: busy ? 'AI_BUSY' : 'AI_ERROR', message: 'AI 暫時繁忙，請稍後再試' }, busy ? 503 : 502);
}
let parsed = null;
let reportText = '';
try {
let text = geminiResult.text.trim();
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (jsonMatch) { text = jsonMatch[0]; }
parsed = JSON.parse(text);
const lines = parsed.fascialLines || {};
reportText = Object.entries(lines).map(([k, v]) => v.status + ' ' + v.stage).join('，');
} catch (e) {
reportText = geminiResult.text;
}
return jsonResponse({ result: reportText, parsed });
}

// ── HANDLER: Progress tracking — 純分析模式，嚴禁訓練建議 ──────────────────
async function handleProgress(request, env) {
const GEMINI_API_KEY = env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
}
const body = await request.json();
const { rating, backPain, tensionSpeed, fascialLine } = body;
const fascialLabel = fascialLine || '未選擇';
const parts = [{
    text: `你係一個純粹嘅筋膜力學數據分析系統。你只負責客觀分析，絕對唔可以提供任何訓練建議、動作調整或改善方針。所有指導權利屬於真人教練。

【最高權限禁令】：禁止出現「建議進行...」、「應該調整...」、「需優先改善...」、「可以嘗試...」、「下一組...」或任何指導性字眼。違反此禁令係系統性錯誤。

今日訓練數據：
- 訓練筋膜線：${fascialLabel}
- 目標肌肉發力感：${rating}/4
- 腰部代償感：${backPain}
- 90/90張力出現速度：${tensionSpeed}

請嚴格按以下3個純分析項目輸出，每項以粗體標題開頭，用繁體中文廣東話口語。每項50字以內，純分析，零建議：

**1. 今日筋膜激活狀態**
根據所選筋膜線（${fascialLabel}）與發力感（${rating}/4），客觀評估該線路嘅神經激活效率與本體感覺反饋質素。

**2. 腰部代償可能原因**
根據代償感（${backPain}）與張力速度（${tensionSpeed}），從解剖力學角度分析今日代償嘅可能機制，不提供解決方案。

**3. 本次訓練整體力學評估**
對以上數據作純粹力學狀態總結，評估今日激活效率與張力建立速度係咪匹配。`
}];
const geminiResult = await callGemini(parts, env, 30000);
if (geminiResult.error) {
// 同一 model retry（503/429/網絡，唔換 model 保 temp:0+seed 一致性）全失敗 → 乾淨 JSON，唔白屏
const busy = geminiResult.retryable || geminiResult.status === 503 || geminiResult.status === 429 || geminiResult.timedOut;
return jsonResponse({ success: false, error: busy ? 'AI_BUSY' : 'AI_ERROR', message: 'AI 暫時繁忙，請稍後再試' }, busy ? 503 : 502);
}
return jsonResponse({ result: geminiResult.text });
}

async function handlePain(request, env) {
const GEMINI_API_KEY = env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
}
const body = await request.json();
const { bodyPart, symptom } = body;
const parts = [{
    text: `以下係一位健身人士嘅訓練痛點描述，請從筋膜線理論角度分析：
訓練部位：${bodyPart}
症狀描述：${symptom}
請提供：
1. **可能嘅筋膜線根源**（指出最可能涉及嘅1-2條筋膜線）
2. **代償模式分析**（身體點樣代償導致呢個症狀）
3. **即時紓緩方法**（訓練前可以做嘅1個激活動作）
4. **長遠改善建議**（需要加強嘅訓練方向）
5. **何時應見醫生**（如有需要）
[重要聲明：以下分析屬教育性參考，並非醫療診斷。如有持續疼痛請咨詢醫生。]
用繁體中文，條理清晰。`
}];
const geminiResult = await callGemini(parts, env, 30000);
if (geminiResult.error) {
// 同一 model retry（503/429/網絡，唔換 model 保 temp:0+seed 一致性）全失敗 → 乾淨 JSON，唔白屏
const busy = geminiResult.retryable || geminiResult.status === 503 || geminiResult.status === 429 || geminiResult.timedOut;
return jsonResponse({ success: false, error: busy ? 'AI_BUSY' : 'AI_ERROR', message: 'AI 暫時繁忙，請稍後再試' }, busy ? 503 : 502);
}
return jsonResponse({ result: geminiResult.text });
}

// 解析後快取嘅 Gemini 策略（endpoint 版本 + 有冇 thinkingConfig）。每 isolate 各一份。
function createGeminiFetcher() {
let lockedCfg = null;
return async function geminiFetchOnce(parts, apiKey, timeoutMs) {
const candidates = lockedCfg ? [lockedCfg] : [
{ ver: 'v1',     thinking: true },
{ ver: 'v1beta', thinking: true },
{ ver: 'v1beta', thinking: false }
];
let fieldErr = null;
for (const cand of candidates) {
const endpoint = `https://generativelanguage.googleapis.com/${cand.ver}/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
const generationConfig = { temperature: 0, seed: 42, maxOutputTokens: 8192 };
if (cand.thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
const body = { contents: [{ parts: parts }], generationConfig };
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), timeoutMs);
let geminiRes;
try {
geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
});
} catch (err) {
clearTimeout(timer);
const aborted = ctrl.signal.aborted;
return { error: 'Failed to reach Gemini API: ' + err.message, retryable: true, timedOut: aborted };
}
clearTimeout(timer);
if (!geminiRes.ok) {
const errText = await geminiRes.text();
let errDetail;
try { errDetail = JSON.parse(errText); } catch { errDetail = { raw: errText }; }
if (geminiRes.status === 400 && isGeminiGeoBlockDetail(errDetail)) {
return {
      error: 'Gemini API error 400',
      status: 400,
      detail: errDetail,
      retryable: false,
      geoBlock: true
};
}
const msg = ((errDetail && errDetail.error && errDetail.error.message) || errText || '').toLowerCase();
if (geminiRes.status === 400 && !lockedCfg &&
(msg.includes('thinking') || msg.includes('unknown name') || msg.includes('unknown field') || msg.includes('invalid json payload'))) {
fieldErr = { error: 'Gemini API error 400', status: 400, detail: errDetail };
continue;
}
return {
      error: 'Gemini API error ' + geminiRes.status,
      status: geminiRes.status,
      detail: errDetail,
      retryable: (geminiRes.status === 503 || geminiRes.status === 429)
};
}
const data = await geminiRes.json();
const text = data?.candidates?.[0]?.content?.parts
?.filter(p => p.text)
?.map(p => p.text)
?.join('') || '';
if (!text) {
return { error: 'Gemini returned no text', rawResponse: data };
}
if (!lockedCfg) lockedCfg = cand;
return { text, cfg: cand.ver + (cand.thinking ? '+thinkingBudget0' : '-noThinkingConfig') };
}
return fieldErr || { error: 'Gemini API error 400', status: 400 };
};
}

const workerGeminiFetch = createGeminiFetcher();
const relayGeminiFetch = createGeminiFetcher();

function isGeminiGeoBlockDetail(detail) {
const err = detail && detail.error;
if (!err) return false;
const msg = (err.message || '').toLowerCase();
const geminiStatus = (err.status || '').toUpperCase();
return msg.includes('user location is not supported')
|| (geminiStatus === 'FAILED_PRECONDITION' && msg.includes('location'));
}

function isGeminiGeoBlock(result) {
return !!(result && (result.geoBlock || (result.status === 400 && isGeminiGeoBlockDetail(result.detail))));
}

async function relayGeminiViaDO(parts, timeoutMs, env) {
if (!env.GEMINI_RELAY) {
return { error: 'GEMINI_RELAY binding not configured', status: 500, retryable: false };
}
const id = env.GEMINI_RELAY.idFromName('gemini-relay');
const stub = env.GEMINI_RELAY.get(id, { locationHint: 'wnam' });
let doRes;
try {
doRes = await stub.fetch('https://gemini-relay/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts, timeoutMs })
});
} catch (err) {
return { error: 'Failed to reach Gemini relay: ' + err.message, retryable: true };
}
let result;
try {
result = await doRes.json();
} catch (err) {
return { error: 'Invalid relay response: ' + err.message, status: doRes.status, retryable: false };
}
if (!doRes.ok && result && !result.error) {
return { error: 'Gemini relay error ' + doRes.status, status: doRes.status, retryable: false };
}
return result;
}

// 單次 Gemini 呼叫。先直連；地區封鎖（400 geo）→ DO relay（wnam）重試。
async function callGeminiOnce(parts, apiKey, timeoutMs, env) {
const directRes = await workerGeminiFetch(parts, apiKey, timeoutMs);
if (!directRes.error) {
console.log('[gemini]', { via: 'direct', cfg: directRes.cfg });
return directRes;
}
if (isGeminiGeoBlock(directRes) && env) {
console.log('[gemini]', { via: 'do-relay', trigger: 'geo-block', directStatus: directRes.status });
const relayRes = await relayGeminiViaDO(parts, timeoutMs, env);
if (!relayRes.error) {
console.log('[gemini]', { via: 'do-relay', ok: true, cfg: relayRes.cfg || null });
}
return relayRes;
}
console.log('[gemini]', { via: 'direct', error: directRes.error, status: directRes.status || null });
return directRes;
}

// Silent retry wrapper。timeoutMs 由 handler 傳（圖片 60s / 純文字 30s）。
// 重試分類：503/429/網絡 → 最多 3 次；timeout(abort) → 最多 2 次（即再試 1 次）。
// 退避 ~600ms→1.2s→2.4s（+jitter）。TOTAL_BUDGET 按 timeoutMs 動態計，防 hang。
async function callGemini(parts, env, timeoutMs) {
const apiKey = env.GEMINI_API_KEY;
if (!apiKey) {
return { error: 'GEMINI_API_KEY not configured', status: 500, retryable: false };
}
const MAX_ATTEMPTS = 3;
const BASE_DELAY = 600;
const PER_FETCH_TIMEOUT = timeoutMs || 30000;
let backoffSum = 0;
for (let i = 1; i < MAX_ATTEMPTS; i++) backoffSum += BASE_DELAY * Math.pow(2, i - 1) * 1.2;
const BUFFER = 2000;
const TOTAL_BUDGET = PER_FETCH_TIMEOUT * MAX_ATTEMPTS + backoffSum + BUFFER;
const start = Date.now();
let last = null;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
const res = await callGeminiOnce(parts, apiKey, PER_FETCH_TIMEOUT, env);
if (!res.error) return res;
last = res;
if (!res.retryable) break;
const cap = res.timedOut ? 2 : MAX_ATTEMPTS;
if (attempt >= cap) break;
const delay = Math.round(BASE_DELAY * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4));
if (Date.now() - start + delay > TOTAL_BUDGET) break;
await new Promise(r => setTimeout(r, delay));
}
return last;
}

function uint8ArrayToBase64(uint8Array) {
let binary = '';
const chunkSize = 8192;
for (let i = 0; i < uint8Array.length; i += chunkSize) {
const chunk = uint8Array.subarray(i, i + chunkSize);
binary += String.fromCharCode.apply(null, chunk);
}
return btoa(binary);
}

function corsHeaders() {
return {
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Methods': 'POST, OPTIONS',
'Access-Control-Allow-Headers': 'Content-Type'
};
}

function jsonResponse(data, status = 200) {
return new Response(JSON.stringify(data), {
status,
    headers: {
'Content-Type': 'application/json; charset=utf-8',
...corsHeaders()
}
});
}

async function handleFisStep3(request, env) {
const body = await request.json();
const parsed = body.parsed || null;
const step2Result = body.step2Result || '';
return jsonResponse({
    success: true,
    imageUrl: 'https://alexeywong22-fis.github.io/fis-app/fis-bg.png',
    parsed: parsed,
    rawText: step2Result
});
}

async function handleUserInit(request, env) {
try {
const body = await request.json().catch(() => ({}));
let userId = body.userId || null;
if (userId && env.DB) {
const existing = await env.DB.prepare(
'SELECT id, name FROM users WHERE id = ?'
      ).bind(userId).first();
if (existing) {
return jsonResponse({ userId: existing.id, name: existing.name, existing: true });
}
}
const newId = 'usr_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
const name = 'User_' + newId.substring(4, 10);
const email = newId + '@fis.local';
if (env.DB) {
await env.DB.prepare(
'INSERT INTO users (id, name, email, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))'
      ).bind(newId, name, email).run();
}
return jsonResponse({ userId: newId, name: name, existing: false });
} catch (e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleFasciaTestSave(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const userId = body.userId || null;
const parsed = body.parsed || {};
const gender = body.gender || null;
const step1Raw = body.step1Result || null;
const lines = parsed.fascialLines || {};
const recs = parsed.recommendations || {};
if (!userId) return jsonResponse({ error: 'Missing userId' }, 400);
const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
if (!user) return jsonResponse({ error: 'User not found' }, 404);
const id = 'ft_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
const dl = lines.deepFrontLine || {};
const ll = lines.lateralLine || {};
const sl = lines.spiralLine || {};
const sbl = lines.superficialBackLine || {};
const sfl = lines.superficialFrontLine || {};
function stageNum(stage) {
return stage === 'Stage 1' ? 1 : stage === 'Stage 2' ? 2 : null;
}
await env.DB.prepare(`
      INSERT INTO fascia_tests (
        id, user_id,
        deep_front_line, lateral_line, spiral_line,
        superficial_back_line, superficial_front_line,
        ai_parsed, gender, ai_analysis, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
id, userId,
stageNum(dl.stage), stageNum(ll.stage), stageNum(sl.stage),
stageNum(sbl.stage), stageNum(sfl.stage),
JSON.stringify(parsed), gender, step1Raw
    ).run();
return jsonResponse({ success: true, testId: id });
} catch (e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleProgressSave(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const { userId, trainingType, muscleActivation, backCompensation, tensionSpeed, notes } = body;
if (!userId) return jsonResponse({ error: 'Missing userId' }, 400);
if (!muscleActivation || !backCompensation || !tensionSpeed) {
return jsonResponse({ error: 'Missing required fields' }, 400);
}
const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
if (!user) return jsonResponse({ error: 'User not found' }, 404);
const id = 'pl_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
await env.DB.prepare(`
      INSERT INTO progress_logs (
        id, user_id, training_type,
        muscle_activation, back_compensation, tension_speed,
        notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, userId, trainingType || null, muscleActivation, backCompensation, tensionSpeed, notes || null).run();
return jsonResponse({ success: true, logId: id });
} catch (e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handlePainSave(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const { userId, bodyPart, painLevel, symptomDescription, aiFascialRoot, aiDiagnosis } = body;
if (!userId) return jsonResponse({ error: 'Missing userId' }, 400);
if (!bodyPart || !symptomDescription) {
return jsonResponse({ error: 'Missing required fields' }, 400);
}
const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
if (!user) return jsonResponse({ error: 'User not found' }, 404);
const id = 'pd_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
await env.DB.prepare(`
      INSERT INTO pain_diagnoses (
        id, user_id, body_part, pain_level,
        symptom_description, ai_fascial_root, ai_diagnosis,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))
    `).bind(id, userId, bodyPart, painLevel || null, symptomDescription, aiFascialRoot || null, aiDiagnosis || null).run();
return jsonResponse({ success: true, diagnosisId: id });
} catch (e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleProgressHistory(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const url = new URL(request.url);
const userId = url.searchParams.get('userId');
if (!userId) return jsonResponse({ error: 'Missing userId' }, 400);
const results = await env.DB.prepare(
'SELECT * FROM progress_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 20'
    ).bind(userId).all();
return jsonResponse({ records: results.results || [] });
} catch (e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleSubmitLog(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const { userId, muscleActivation, backCompensation, tensionSpeed, trainingType, notes } = body;
if (!userId || !muscleActivation || !backCompensation || !tensionSpeed) {
return jsonResponse({ error: 'Missing required fields' }, 400);
}
const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
if (!user) return jsonResponse({ error: 'User not found' }, 404);
const id = 'pl_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
await env.DB.prepare(`
      INSERT INTO progress_logs (
        id, user_id, training_type,
        muscle_activation, back_compensation, tension_speed,
        notes, logged_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, userId, trainingType || null, muscleActivation, backCompensation, tensionSpeed, notes || null).run();
const previous = await env.DB.prepare(`
      SELECT * FROM progress_logs
      WHERE user_id = ? AND id != ?
      ORDER BY logged_at DESC LIMIT 1
    `).bind(userId, id).first();
const baseline = await env.DB.prepare(`
      SELECT * FROM progress_logs
      WHERE user_id = ? AND id != ?
      ORDER BY logged_at ASC LIMIT 1
    `).bind(userId, id).first();
function calcChange(current, compare) {
if (!compare || !compare.muscle_activation) return null;
const diff = current - compare.muscle_activation;
const pct = Math.round((diff / compare.muscle_activation) * 100);
return { diff, pct, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same' };
}
const vsLast = previous ? calcChange(muscleActivation, previous) : null;
const vsBaseline = baseline ? calcChange(muscleActivation, baseline) : null;
return jsonResponse({
      success: true,
      logId: id,
      comparison: {
        current: { muscleActivation, backCompensation, tensionSpeed },
        vsLastSession: vsLast ? {
          lastDate: previous.logged_at,
          lastActivation: previous.muscle_activation,
          change: vsLast
} : null,
        vsBaseline: vsBaseline ? {
          baselineDate: baseline.logged_at,
          baselineActivation: baseline.muscle_activation,
          change: vsBaseline
} : null
}
});
} catch (e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleCoachUserSummary(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
if (request.method !== 'POST') {
return jsonResponse({ error: 'Method not allowed' }, 405);
}
let body;
try { body = await request.json(); } catch(e) {
return jsonResponse({ error: 'Invalid JSON body' }, 400);
}
const username = body.username || null;
const password = body.password || null;
const userId   = body.user_id  || null;
const validPassword = env[username];
if (!username || !password || !validPassword || password !== validPassword) {
return jsonResponse({ error: 'Forbidden: Invalid username or password' }, 403);
}
if (!userId) return jsonResponse({ error: 'Missing user_id' }, 400);
try {
const user = await env.DB.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').bind(userId).first();
if (!user) return jsonResponse({ error: 'User not found' }, 404);
const fasciaAll = await env.DB.prepare(`
      SELECT id, tested_at,
        deep_front_line, lateral_line, spiral_line,
        superficial_back_line, superficial_front_line,
        photo_front_url, photo_side_url, photo_back_url
      FROM fascia_tests WHERE user_id = ?
      ORDER BY tested_at DESC LIMIT 10
    `).bind(userId).all();
const fasciaBaseline = await env.DB.prepare(`
      SELECT deep_front_line, lateral_line, spiral_line,
        superficial_back_line, superficial_front_line, tested_at
      FROM fascia_tests WHERE user_id = ?
      ORDER BY tested_at ASC LIMIT 1
    `).bind(userId).first();
const fasciaLatest = fasciaAll.results?.[0] || null;
const progressLogs = await env.DB.prepare(`
      SELECT id, logged_at, training_type,
        muscle_activation, back_compensation, tension_speed, notes
      FROM progress_logs WHERE user_id = ?
      ORDER BY logged_at DESC LIMIT 20
    `).bind(userId).all();
const logs = progressLogs.results || [];
const avgActivation = logs.length > 0
? Math.round((logs.reduce((sum, l) => sum + (l.muscle_activation || 0), 0) / logs.length) * 10) / 10
: null;
const compensationRate = logs.length > 0
? Math.round((logs.filter(l => l.back_compensation === '有').length / logs.length) * 100)
: null;
const painHistory = await env.DB.prepare(`
      SELECT id, reported_at, body_part, pain_level,
        symptom_description, ai_fascial_root, ai_diagnosis, status
      FROM pain_diagnoses WHERE user_id = ?
      ORDER BY reported_at DESC LIMIT 20
    `).bind(userId).all();
const painCounts = {};
    (painHistory.results || []).forEach(p => {
painCounts[p.body_part] = (painCounts[p.body_part] || 0) + 1;
});
const hotspots = Object.entries(painCounts)
.sort((a, b) => b[1] - a[1])
.map(([part, count]) => ({ part, count }));
return jsonResponse({
user,
      summary: {
        totalFasciaTests: fasciaAll.results?.length || 0,
        totalProgressLogs: logs.length,
        totalPainDiagnoses: painHistory.results?.length || 0,
        avgMuscleActivation: avgActivation,
        backCompensationRate: compensationRate !== null ? compensationRate + '%' : null,
        painHotspots: hotspots.slice(0, 3)
},
      fisData: {
        baseline: fasciaBaseline,
        latest: fasciaLatest,
        history: fasciaAll.results || []
},
      progressData: {
        logs: logs,
        trend: logs.slice(0, 5).map(l => ({
          date: l.logged_at?.substring(0, 10),
          activation: l.muscle_activation,
          compensation: l.back_compensation
}))
},
      painData: {
        diagnoses: painHistory.results || [],
hotspots
}
});
} catch (e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleUpdateUsername(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const { userId, newName } = body;
if (!userId || !newName) return jsonResponse({ error: 'Missing userId or newName' }, 400);
if (!/^[a-zA-Z0-9_]{3,20}$/.test(newName)) {
return jsonResponse({ error: '名稱只可用英文、數字、底線，3-20個字元' }, 400);
}
const existing = await env.DB.prepare(
'SELECT id FROM users WHERE name = ? AND id != ?'
    ).bind(newName, userId).first();
if (existing) return jsonResponse({ error: '此名稱已被使用，請換一個' }, 409);
await env.DB.prepare(
'UPDATE users SET name = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(newName, userId).run();
return jsonResponse({ success: true, name: newName });
} catch(e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleCoachLogin(request, env) {
try {
const body = await request.json();
const { username, password } = body;
const validPassword = env[username];
if (!username || !password || !validPassword || password !== validPassword) {
return jsonResponse({ error: 'Forbidden: Invalid username or password' }, 403);
}
return jsonResponse({ success: true, role: 'coach', username });
} catch(e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleCoachUsers(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const { username, password } = body;
const validPassword = env[username];
if (!username || !password || !validPassword || password !== validPassword) {
return jsonResponse({ error: 'Forbidden: Invalid username or password' }, 403);
}
const users = await env.DB.prepare(`
      SELECT
        u.id, u.name, u.created_at,
        COUNT(DISTINCT ft.id) as fascia_count,
        COUNT(DISTINCT pl.id) as log_count,
        COUNT(DISTINCT pd.id) as pain_count,
        MAX(pl.logged_at) as last_active,
        MAX(ua.email) as email,
        MAX(CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END) as is_registered
      FROM users u
      LEFT JOIN fascia_tests ft ON ft.user_id = u.id
      LEFT JOIN progress_logs pl ON pl.user_id = u.id
      LEFT JOIN pain_diagnoses pd ON pd.user_id = u.id
      LEFT JOIN user_accounts ua ON ua.primary_user_id = u.id
      GROUP BY u.id
      ORDER BY last_active DESC NULLS LAST
    `).all();
return jsonResponse({ success: true, users: users.results || [] });
} catch(e) {
return jsonResponse({ error: e.message }, 500);
}
}

// ── 日期視角：按日 group 所有功能使用，coach_key gated（純新增，唔影響現有 API）──
async function handleCoachDaily(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const { username, password } = body;
const validPassword = env[username];
if (!username || !password || !validPassword || password !== validPassword) {
return jsonResponse({ error: 'Forbidden: Invalid username or password' }, 403);
}
const fascia = await env.DB.prepare("SELECT ft.user_id, u.name, ft.created_at AS at, '筋膜自測' AS type, ft.ai_parsed AS detail, ft.gender AS gender, ft.ai_analysis AS step1 FROM fascia_tests ft LEFT JOIN users u ON u.id = ft.user_id ORDER BY ft.created_at DESC LIMIT 2000").all();
const logs = await env.DB.prepare("SELECT pl.user_id, u.name, pl.created_at AS at, '訓練日誌' AS type, pl.training_type AS detail FROM progress_logs pl LEFT JOIN users u ON u.id = pl.user_id ORDER BY pl.created_at DESC LIMIT 2000").all();
const pains = await env.DB.prepare("SELECT pd.user_id, u.name, pd.created_at AS at, '痛點診斷' AS type, pd.body_part AS detail FROM pain_diagnoses pd LEFT JOIN users u ON u.id = pd.user_id ORDER BY pd.created_at DESC LIMIT 2000").all();
const rows = [...(fascia.results || []), ...(logs.results || []), ...(pains.results || [])];
const days = {};
for (const r of rows) {
if (!r.at) continue;
const day = String(r.at).substring(0, 10);
const time = String(r.at).substring(11, 16);
if (!days[day]) days[day] = { date: day, users: {} };
const uid = r.user_id || 'unknown';
if (!days[day].users[uid]) days[day].users[uid] = { userId: uid, name: r.name || '未命名', actions: {} };
const acts = days[day].users[uid].actions;
if (!acts[r.type]) acts[r.type] = { type: r.type, count: 0, latestAt: time, latestDetail: r.detail || null, gender: r.gender || null, step1: r.step1 || null };
acts[r.type].count += 1;
}
const out = Object.values(days).sort((a, b) => b.date.localeCompare(a.date)).map(d => {
const users = Object.values(d.users).map(u => ({ userId: u.userId, name: u.name, actions: Object.values(u.actions) }));
const totalActions = users.reduce((acc, u) => acc + u.actions.reduce((x, a) => x + a.count, 0), 0);
return { date: d.date, userCount: users.length, totalActions, users };
});
return jsonResponse({ success: true, days: out });
} catch (e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleWeeklySave(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const { userId, score, improvement, nextFocus, weekDate } = body;
if (!userId) return jsonResponse({ error: 'Missing userId' }, 400);
const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
if (!user) return jsonResponse({ error: 'User not found' }, 404);
const id = 'wa_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
const date = weekDate || new Date().toISOString().substring(0, 10);
await env.DB.prepare(`
      INSERT INTO weekly_assessments (id, user_id, week_date, score, improvement, next_focus, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, userId, date, score || null, improvement || null, nextFocus || null).run();
return jsonResponse({ success: true, assessmentId: id });
} catch(e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleFunctionalSave(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const body = await request.json();
const { userId, singleLegLeft, singleLegRight, jeffersonCurlLevel, breathingPattern, notes } = body;
if (!userId) return jsonResponse({ error: 'Missing userId' }, 400);
const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
if (!user) return jsonResponse({ error: 'User not found' }, 404);
const id = 'ft2_' + crypto.randomUUID().replace(/-/g, '').substring(0, 14);
await env.DB.prepare(`
      INSERT INTO functional_tests (id, user_id, single_leg_left, single_leg_right, jefferson_curl_level, breathing_pattern, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, userId, singleLegLeft || null, singleLegRight || null, jeffersonCurlLevel || null, breathingPattern || null, notes || null).run();
return jsonResponse({ success: true, testId: id });
} catch(e) {
return jsonResponse({ error: e.message }, 500);
}
}

async function handleCoachUserSummaryV2(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body;
try { body = await request.json(); }
catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const { coach_key, user_id } = body;
const validKey = env['alexeywong22'] || '';
if (!coach_key || !timingSafeEqual(coach_key, validKey)) {
await new Promise(r => setTimeout(r, 200));
return jsonResponse({ error: 'Forbidden: invalid coach_key' }, 403);
}
if (!user_id) return jsonResponse({ error: 'Missing user_id' }, 400);
try {
const user = await env.DB.prepare(
'SELECT id, name, email, total_training_days, created_at FROM users WHERE id = ?'
    ).bind(user_id).first();
if (!user) return jsonResponse({ error: 'User not found' }, 404);
const logsResult = await env.DB.prepare(`
      SELECT id, training_day_index, muscle_activation,
             back_compensation, tension_speed, training_type, notes, logged_at
      FROM progress_logs WHERE user_id = ?
      ORDER BY training_day_index DESC LIMIT 50
    `).bind(user_id).all();
const logs = logsResult.results || [];
const totalLogs = logs.length;
const avgActivation = totalLogs > 0
? Math.round((logs.reduce((s, l) => s + (l.muscle_activation || 0), 0) / totalLogs) * 10) / 10 : null;
const compensationRate = totalLogs > 0
? Math.round((logs.filter(l => l.back_compensation === '有').length / totalLogs) * 100) : null;
const functionalResult = await env.DB.prepare(`
      SELECT id, training_day_index, photo_front_url, photo_side_url, photo_back_url,
             single_leg_left, single_leg_right, jefferson_curl_level, squat_compensation,
             ai_fascial_report, tested_at
      FROM functional_tests WHERE user_id = ?
      ORDER BY training_day_index DESC LIMIT 10
    `).bind(user_id).all();
const functionalTests = functionalResult.results || [];
const painResult = await env.DB.prepare(`
      SELECT id, body_part, pain_level, symptom_description,
             ai_fascial_root, ai_diagnosis, status, reported_at
      FROM pain_diagnoses WHERE user_id = ?
      ORDER BY reported_at DESC LIMIT 20
    `).bind(user_id).all();
const painDiagnoses = painResult.results || [];
const partCount = {};
painDiagnoses.forEach(p => { partCount[p.body_part] = (partCount[p.body_part] || 0) + 1; });
const painHotspots = Object.entries(partCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([part,count])=>({part,count}));
const weeklyResult = await env.DB.prepare(`
      SELECT week_date, score, improvement, next_focus, created_at
      FROM weekly_assessments WHERE user_id = ?
      ORDER BY week_date DESC LIMIT 12
    `).bind(user_id).all();
// FIS 筋膜線自我檢測（fascia_tests，由 /api/fascia-test/save 寫入）—— 純新增，唔影響上面 functional_tests
const fasciaResult = await env.DB.prepare(`
      SELECT id, created_at,
             deep_front_line, lateral_line, spiral_line,
             superficial_back_line, superficial_front_line, ai_parsed
      FROM fascia_tests WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 10
    `).bind(user_id).all();
const fasciaTests = fasciaResult.results || [];
let fasciaLatestParsed = null;
if (fasciaTests[0] && fasciaTests[0].ai_parsed) {
  try { fasciaLatestParsed = JSON.parse(fasciaTests[0].ai_parsed); } catch (e) { fasciaLatestParsed = null; }
}
return jsonResponse({
user,
      summary: { totalTrainingDays: user.total_training_days || totalLogs, totalFunctionalTests: functionalTests.length, totalPainDiagnoses: painDiagnoses.length, avgMuscleActivation: avgActivation, backCompensationRate: compensationRate !== null ? compensationRate + '%' : null, painHotspots },
      dataSection: { logs, stats: { avgActivation, compensationRate } },
      fisSection: { baseline: functionalTests[functionalTests.length-1]||null, latest: functionalTests[0]||null, history: functionalTests },
      rxSection: { diagnoses: painDiagnoses, hotspots: painHotspots, active: painDiagnoses.filter(p=>p.status==='active').length },
      weeklySection: { assessments: weeklyResult.results || [] },
      fasciaSelfAssessment: { total: fasciaTests.length, latestAt: (fasciaTests[0] && fasciaTests[0].created_at) || null, latest: fasciaLatestParsed, history: fasciaTests }
});
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleCheckProgress(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
const url = new URL(request.url);
const user_id = url.searchParams.get('user_id');
if (!user_id) return jsonResponse({ error: 'Missing user_id' }, 400);
try {
const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM progress_logs WHERE user_id = ?').bind(user_id).first();
const total = countRow?.total || 0;
let weeklyComparison;
if (total >= 7) {
const latest = await env.DB.prepare(`SELECT training_day_index, muscle_activation, back_compensation, tension_speed, logged_at FROM progress_logs WHERE user_id = ? ORDER BY training_day_index DESC LIMIT 1 OFFSET 0`).bind(user_id).first();
const sevenAgo = await env.DB.prepare(`SELECT training_day_index, muscle_activation, back_compensation, tension_speed, logged_at FROM progress_logs WHERE user_id = ? ORDER BY training_day_index DESC LIMIT 1 OFFSET 6`).bind(user_id).first();
if (latest && sevenAgo) {
const diff = (latest.muscle_activation||0) - (sevenAgo.muscle_activation||0);
const pct = sevenAgo.muscle_activation ? Math.round((diff/sevenAgo.muscle_activation)*100) : 0;
weeklyComparison = { status:'available', period:{ from:{day:sevenAgo.training_day_index,date:(sevenAgo.logged_at||'').substring(0,10)}, to:{day:latest.training_day_index,date:(latest.logged_at||'').substring(0,10)} }, activation:{before:sevenAgo.muscle_activation,after:latest.muscle_activation,diff,pct,direction:diff>0?'up':diff<0?'down':'same'}, compensation:{before:sevenAgo.back_compensation,after:latest.back_compensation}, tension:{before:sevenAgo.tension_speed,after:latest.tension_speed} };
}
} else {
weeklyComparison = { status:'insufficient', message:`還需要 ${7-total} 次訓練才能進行週評對比`, current:total, required:7 };
}
let functionalComparison;
const isMultipleOf28 = total > 0 && total % 28 === 0;
if (isMultipleOf28) {
const latestTest = await env.DB.prepare(`SELECT * FROM functional_tests WHERE user_id = ? ORDER BY training_day_index DESC LIMIT 1 OFFSET 0`).bind(user_id).first();
const prevTest = await env.DB.prepare(`SELECT * FROM functional_tests WHERE user_id = ? ORDER BY training_day_index DESC LIMIT 1 OFFSET 1`).bind(user_id).first();
if (latestTest && prevTest) {
functionalComparison = { status:'available', milestone:total, singleLeg:{ left:{before:prevTest.single_leg_left,after:latestTest.single_leg_left,diff:latestTest.single_leg_left&&prevTest.single_leg_left?Math.round((latestTest.single_leg_left-prevTest.single_leg_left)*10)/10:null}, right:{before:prevTest.single_leg_right,after:latestTest.single_leg_right,diff:latestTest.single_leg_right&&prevTest.single_leg_right?Math.round((latestTest.single_leg_right-prevTest.single_leg_right)*10)/10:null} }, jeffersonCurl:{before:prevTest.jefferson_curl_level,after:latestTest.jefferson_curl_level,improved:(latestTest.jefferson_curl_level||0)>(prevTest.jefferson_curl_level||0)}, compensation:{before:prevTest.squat_compensation,after:latestTest.squat_compensation}, photos:{before:{front:prevTest.photo_front_url,side:prevTest.photo_side_url,back:prevTest.photo_back_url},after:{front:latestTest.photo_front_url,side:latestTest.photo_side_url,back:latestTest.photo_back_url}} };
} else {
functionalComparison = { status:'no_test_data', message:'已到功能性測試里程碑，但尚未完成測試記錄' };
}
} else {
const nextMilestone = Math.ceil(total/28)*28||28;
functionalComparison = { status:'not_due', message:`第 ${nextMilestone} 次訓練將進行功能性大對比`, current:total, nextMilestone };
}
return jsonResponse({ user_id, totalTrainingDays:total, weeklyComparison, functionalComparison });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

function timingSafeEqual(a, b) {
if (typeof a !== 'string' || typeof b !== 'string') return false;
if (a.length !== b.length) return false;
let diff = 0;
for (let i = 0; i < a.length; i++) { diff |= a.charCodeAt(i) ^ b.charCodeAt(i); }
return diff === 0;
}

// ============================================================================
// Stage 1 — 教練 email + 密碼認證（PBKDF2 hash + DB opaque session token）
// 純新增，唔影響現有 /api/coach/login、/api/coach/users、user-summary(-v2)。
// ============================================================================
const COACH_PBKDF2_ITERATIONS = 100000;   // Cloudflare Workers PBKDF2 硬上限 = 100000（超過會拒）。逐行存 iterations + hash_version，將來要更強可換 WASM argon2/bcrypt
const COACH_HASH_VERSION = 1;
const COACH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;   // 12 小時

function coachBufToB64(buf) {
const bytes = new Uint8Array(buf);
let bin = '';
for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
return btoa(bin);
}
function coachB64ToBytes(b64) {
const bin = atob(b64);
const bytes = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
return bytes;
}
function coachBase64Url(bytes) {
return coachBufToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function coachPbkdf2(password, saltBytes, iterations) {
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, key, 256);
return new Uint8Array(bits);
}
async function coachSha256Hex(str) {
const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// 由 Authorization: Bearer <token> 取回有效教練（過期自動清），失敗返 null
async function coachFromToken(request, env) {
const auth = request.headers.get('Authorization') || '';
const m = auth.match(/^Bearer\s+(.+)$/i);
if (!m) return null;
const tokenHash = await coachSha256Hex(m[1].trim());
const row = await env.DB.prepare(
'SELECT s.coach_id, s.expires_at, c.email, c.role, c.name, c.status FROM coach_sessions s JOIN coaches c ON c.id = s.coach_id WHERE s.token_hash = ?'
).bind(tokenHash).first();
if (!row) return null;
if (new Date(row.expires_at).getTime() < Date.now()) {
await env.DB.prepare('DELETE FROM coach_sessions WHERE token_hash = ?').bind(tokenHash).run();
return null;
}
if (row.status !== 'active') return null;
return { id: row.coach_id, email: row.email, role: row.role, name: row.name };
}

async function handleCoachAuthRegister(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body;
try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const email = (body.email || '').trim().toLowerCase();
const password = body.password || '';
const name = body.name || null;
let role = body.role === 'admin' ? 'admin' : 'coach';
try {
// 授權：(1) 有效 admin token，或 (2) coaches 表仲空 + 正確 bootstrap_key（= legacy secret）
const caller = await coachFromToken(request, env);
let authorized = false;
if (caller && caller.role === 'admin') {
authorized = true;
} else {
const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM coaches').first();
const isEmpty = ((cnt && cnt.c) || 0) === 0;
const legacy = env['alexeywong22'] || '';
if (isEmpty && body.bootstrap_key && legacy && timingSafeEqual(body.bootstrap_key, legacy)) {
authorized = true;
role = 'admin';   // 第一個 bootstrap 帳號強制 admin
}
}
if (!authorized) {
await new Promise(r => setTimeout(r, 200));
return jsonResponse({ error: 'Forbidden: requires admin token or valid bootstrap_key (only when no coach exists)' }, 403);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonResponse({ error: 'Invalid email' }, 400);
if (typeof password !== 'string' || password.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
const existing = await env.DB.prepare('SELECT id FROM coaches WHERE email = ?').bind(email).first();
if (existing) return jsonResponse({ error: 'Email already registered' }, 409);
const salt = crypto.getRandomValues(new Uint8Array(16));
const hash = await coachPbkdf2(password, salt, COACH_PBKDF2_ITERATIONS);
const id = 'coach_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
await env.DB.prepare(
'INSERT INTO coaches (id, email, password_hash, salt, iterations, hash_version, role, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
).bind(id, email, coachBufToB64(hash), coachBufToB64(salt), COACH_PBKDF2_ITERATIONS, COACH_HASH_VERSION, role, name).run();
return jsonResponse({ success: true, id, email, role });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleCoachAuthLogin(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body;
try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const email = (body.email || '').trim().toLowerCase();
const password = body.password || '';
try {
const c = await env.DB.prepare('SELECT id, password_hash, salt, iterations, role, name, status FROM coaches WHERE email = ?').bind(email).first();
// 無論搵唔搵到都行一次 hash + 固定延遲，減少 timing / 帳號枚舉
const saltBytes = c ? coachB64ToBytes(c.salt) : crypto.getRandomValues(new Uint8Array(16));
const iters = c ? c.iterations : COACH_PBKDF2_ITERATIONS;
const derived = await coachPbkdf2(password, saltBytes, iters);
const ok = c && c.status === 'active' && timingSafeEqual(coachBufToB64(derived), c.password_hash);
if (!ok) {
await new Promise(r => setTimeout(r, 200));
return jsonResponse({ error: 'Invalid email or password' }, 401);
}
const token = coachBase64Url(crypto.getRandomValues(new Uint8Array(32)));
const tokenHash = await coachSha256Hex(token);
const expires = new Date(Date.now() + COACH_SESSION_TTL_MS).toISOString();
await env.DB.prepare('INSERT INTO coach_sessions (token_hash, coach_id, expires_at) VALUES (?, ?, ?)').bind(tokenHash, c.id, expires).run();
return jsonResponse({ success: true, token, expires_at: expires, role: c.role, name: c.name, email });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleCoachAuthLogout(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const auth = request.headers.get('Authorization') || '';
const m = auth.match(/^Bearer\s+(.+)$/i);
if (m) {
const tokenHash = await coachSha256Hex(m[1].trim());
await env.DB.prepare('DELETE FROM coach_sessions WHERE token_hash = ?').bind(tokenHash).run();
}
return jsonResponse({ success: true });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleCoachAuthMe(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
const c = await coachFromToken(request, env);
if (!c) return jsonResponse({ error: 'Unauthorized' }, 401);
return jsonResponse({ success: true, id: c.id, email: c.email, role: c.role, name: c.name });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

// ============================================================================
// 用戶 email 帳戶登入 v1（密碼）。全 body-based（token 喺 body，零 CORS 改動）。
// 重用教練 crypto helper（coachPbkdf2 / coachSha256Hex / coachBufToB64 / coachB64ToBytes
// / coachBase64Url / timingSafeEqual）+ COACH_PBKDF2_ITERATIONS(100000) / COACH_HASH_VERSION。
// 表：user_accounts / user_account_sessions（migrations/0002_user_accounts.sql）。
// ============================================================================
const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 日

// 由 body 嘅 raw token 取回有效帳戶（過期自動清），失敗返 null
async function accountFromToken(token, env) {
if (!token || typeof token !== 'string') return null;
const tokenHash = await coachSha256Hex(token.trim());
const row = await env.DB.prepare(
'SELECT s.account_id, s.expires_at, a.email, a.primary_user_id, a.status FROM user_account_sessions s JOIN user_accounts a ON a.id = s.account_id WHERE s.token_hash = ?'
).bind(tokenHash).first();
if (!row) return null;
if (new Date(row.expires_at).getTime() < Date.now()) {
await env.DB.prepare('DELETE FROM user_account_sessions WHERE token_hash = ?').bind(tokenHash).run();
return null;
}
if (row.status !== 'active') return null;
return { id: row.account_id, email: row.email, primary_user_id: row.primary_user_id };
}

async function handleAccountRegister(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body;
try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const email = (body.email || '').trim().toLowerCase();
const password = body.password || '';
const currentUserId = body.currentUserId || null;
try {
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonResponse({ error: 'Invalid email' }, 400);
if (typeof password !== 'string' || password.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
if (!currentUserId) return jsonResponse({ error: 'Missing currentUserId' }, 400);
// 確認要 bind 嘅匿名 usr_ 存在
const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(currentUserId).first();
if (!u) return jsonResponse({ error: 'currentUserId not found' }, 400);
// email unique
const existing = await env.DB.prepare('SELECT id FROM user_accounts WHERE email = ?').bind(email).first();
if (existing) return jsonResponse({ error: 'Email already registered' }, 409);
const salt = crypto.getRandomValues(new Uint8Array(16));
const hash = await coachPbkdf2(password, salt, COACH_PBKDF2_ITERATIONS);
const id = 'acct_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
await env.DB.prepare(
'INSERT INTO user_accounts (id, email, password_hash, salt, iterations, hash_version, primary_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
).bind(id, email, coachBufToB64(hash), coachBufToB64(salt), COACH_PBKDF2_ITERATIONS, COACH_HASH_VERSION, currentUserId).run();
// 創始 allowlist：email 喺 founding_grants → 自動 course_access=1（set-and-forget）。
// try/catch：founding_grants / course_access 未 migrate 或查唔到，一律唔阻礙正常註冊。
try {
const grant = await env.DB.prepare('SELECT email FROM founding_grants WHERE email = ?').bind(email).first();
if (grant) await env.DB.prepare('UPDATE user_accounts SET course_access = 1 WHERE id = ?').bind(id).run();
} catch (e) { /* 名單表 / course_access 欄未存在都唔阻礙註冊 */ }
const token = coachBase64Url(crypto.getRandomValues(new Uint8Array(32)));
const tokenHash = await coachSha256Hex(token);
const expires = new Date(Date.now() + ACCOUNT_SESSION_TTL_MS).toISOString();
await env.DB.prepare('INSERT INTO user_account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(tokenHash, id, expires).run();
return jsonResponse({ success: true, token, expires_at: expires, primary_user_id: currentUserId, email });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleAccountLogin(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body;
try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const email = (body.email || '').trim().toLowerCase();
const password = body.password || '';
try {
const a = await env.DB.prepare('SELECT id, password_hash, salt, iterations, primary_user_id, status FROM user_accounts WHERE email = ?').bind(email).first();
// 搵唔到 email 都照行一次 hash + 固定延遲，減少 timing / 帳號枚舉
const saltBytes = a ? coachB64ToBytes(a.salt) : crypto.getRandomValues(new Uint8Array(16));
const iters = a ? a.iterations : COACH_PBKDF2_ITERATIONS;
const derived = await coachPbkdf2(password, saltBytes, iters);
const ok = a && a.status === 'active' && timingSafeEqual(coachBufToB64(derived), a.password_hash);
if (!ok) {
await new Promise(r => setTimeout(r, 200));
return jsonResponse({ error: 'Invalid email or password' }, 401);
}
const token = coachBase64Url(crypto.getRandomValues(new Uint8Array(32)));
const tokenHash = await coachSha256Hex(token);
const expires = new Date(Date.now() + ACCOUNT_SESSION_TTL_MS).toISOString();
await env.DB.prepare('INSERT INTO user_account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(tokenHash, a.id, expires).run();
return jsonResponse({ success: true, token, expires_at: expires, primary_user_id: a.primary_user_id, email });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleAccountLogout(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
let body; try { body = await request.json(); } catch (e) { body = {}; }
const token = body.token || '';
if (token) {
const tokenHash = await coachSha256Hex(String(token).trim());
await env.DB.prepare('DELETE FROM user_account_sessions WHERE token_hash = ?').bind(tokenHash).run();
}
return jsonResponse({ success: true });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

async function handleAccountMe(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
try {
let body; try { body = await request.json(); } catch (e) { body = {}; }
const acct = await accountFromToken(body.token || '', env);
if (!acct) return jsonResponse({ error: 'Unauthorized' }, 401);
// course_access 用獨立 try/catch query（欄未 migrate 都唔會整爛 /me / session 驗證）
let courseAccess = 0;
try { const row = await env.DB.prepare('SELECT course_access FROM user_accounts WHERE id = ?').bind(acct.id).first(); courseAccess = (row && row.course_access) || 0; } catch (e) { courseAccess = 0; }
return jsonResponse({ success: true, email: acct.email, primary_user_id: acct.primary_user_id, course_access: !!courseAccess });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

// ── Email OTP 原語 ───────────────────────────────────────────────────────────
// 重用：coachPbkdf2 / coachSha256Hex / timingSafeEqual / coachBase64Url、user_account_sessions、ACCOUNT_SESSION_TTL_MS。
const OTP_TTL_MS = 10 * 60 * 1000;           // 驗證碼 10 分鐘有效
const OTP_MAX_ATTEMPTS = 5;                  // 同一碼最多試 5 次，超過即作廢
const OTP_HOURLY_LIMIT = 5;                  // 每 email+purpose 每小時最多請求 5 次
// 寄件人：先用 Resend 測試域名；驗證 alexeywong.com 後改 'FIS <noreply@alexeywong.com>'
const OTP_FROM = 'FIS <onboarding@resend.dev>';

// 出 session token（同 login/register 一致：random token、DB 只存 SHA-256）
async function issueAccountSession(accountId, env) {
const token = coachBase64Url(crypto.getRandomValues(new Uint8Array(32)));
const tokenHash = await coachSha256Hex(token);
const expires = new Date(Date.now() + ACCOUNT_SESSION_TTL_MS).toISOString();
await env.DB.prepare('INSERT INTO user_account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(tokenHash, accountId, expires).run();
return { token, expires };
}

// Resend 寄 6 位碼。失敗只 log（對外仍 generic），唔 throw。
async function sendOtpEmail(email, code, purpose, env) {
const key = env.RESEND_API_KEY;
if (!key) { console.warn('RESEND_API_KEY not set; OTP not emailed'); return false; }
const isReset = purpose === 'reset';
const subject = isReset ? 'FIS 密碼重設驗證碼' : 'FIS 登入驗證碼';
const lead = isReset ? '你要求重設 FIS 帳戶密碼。' : '你要求用驗證碼登入 FIS。';
const html =
'<div style="font-family:-apple-system,\'Noto Sans HK\',sans-serif;max-width:480px;margin:0 auto;background:#2a3d63;color:#fdf5e5;border-radius:14px;padding:28px">' +
'<div style="font-size:13px;letter-spacing:3px;color:#ffc845;font-weight:700">FIS 筋膜整合系統</div>' +
'<p style="font-size:14px;line-height:1.7;margin:16px 0 8px">' + lead + ' 請喺 App 內輸入以下 6 位驗證碼：</p>' +
'<div style="font-size:34px;font-weight:900;letter-spacing:10px;color:#ffc845;text-align:center;background:rgba(255,200,69,0.1);border:1px solid rgba(255,200,69,0.4);border-radius:10px;padding:14px 0;margin:14px 0">' + code + '</div>' +
'<p style="font-size:12px;color:#ccd6e8;line-height:1.7;margin:8px 0">⏱ 10 分鐘內有效。為咗你嘅帳戶安全，<strong>唔好將驗證碼分享俾任何人</strong>（包括自稱 FIS 職員）。如果唔係你本人要求，可以忽略呢封電郵。</p>' +
'<hr style="border:none;border-top:1px solid rgba(255,200,69,0.15);margin:18px 0">' +
'<p style="font-size:11px;color:#93a4c4;line-height:1.6;margin:0">FIS 屬教育性體態訓練參考工具，並非醫療診斷。本郵件由系統自動發送，請勿直接回覆。</p>' +
'</div>';
try {
const r = await fetch('https://api.resend.com/emails', {
method: 'POST',
headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
body: JSON.stringify({ from: OTP_FROM, to: [email], subject, html })
});
if (!r.ok) { console.warn('Resend send failed ' + r.status + ': ' + (await r.text().catch(() => ''))); return false; }
return true;
} catch (e) { console.warn('Resend error: ' + (e && e.message)); return false; }
}

// 驗證最新一張有效 OTP。consume=true → 成功後標 used。返 { ok, account }。
async function checkOtp(email, purpose, code, env, consume) {
if (!/^\d{6}$/.test(String(code || ''))) return { ok: false };
const row = await env.DB.prepare(
"SELECT id, code_hash, expires_at, attempts FROM email_otps WHERE email = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1"
).bind(email, purpose).first();
if (!row) return { ok: false };
if (new Date(row.expires_at).getTime() < Date.now() || row.attempts >= OTP_MAX_ATTEMPTS) {
await env.DB.prepare('UPDATE email_otps SET used = 1 WHERE id = ?').bind(row.id).run();
return { ok: false };
}
await env.DB.prepare('UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
const codeHash = await coachSha256Hex(purpose + ':' + email + ':' + String(code));
if (!timingSafeEqual(codeHash, row.code_hash)) return { ok: false };
if (consume) await env.DB.prepare('UPDATE email_otps SET used = 1 WHERE id = ?').bind(row.id).run();
const account = await env.DB.prepare("SELECT id, primary_user_id FROM user_accounts WHERE email = ? AND status = 'active'").bind(email).first();
if (!account) return { ok: false };
return { ok: true, account };
}

// POST /api/account/otp/request { email, purpose } —— 一律 generic（防枚舉），只喺帳戶真存在時先寄
async function handleOtpRequest(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body; try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const email = (body.email || '').trim().toLowerCase();
const purpose = body.purpose === 'reset' ? 'reset' : 'login';
const generic = jsonResponse({ success: true, message: '如已有帳戶，驗證碼已寄出（10 分鐘內有效）' });
try {
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return generic;
// 限速（用 SQL datetime 比較，避時區問題）：60 秒 cooldown + 每小時上限
const cd = await env.DB.prepare("SELECT COUNT(*) AS c FROM email_otps WHERE email = ? AND purpose = ? AND created_at > datetime('now','-60 seconds')").bind(email, purpose).first();
if (cd && cd.c > 0) return generic;
const hr = await env.DB.prepare("SELECT COUNT(*) AS c FROM email_otps WHERE email = ? AND purpose = ? AND created_at > datetime('now','-1 hour')").bind(email, purpose).first();
if (hr && hr.c >= OTP_HOURLY_LIMIT) return generic;
// 帳戶必須存在（login 同 reset 都係）；唔存在照回 generic、唔寄
const acct = await env.DB.prepare("SELECT id FROM user_accounts WHERE email = ? AND status = 'active'").bind(email).first();
if (!acct) return generic;
// 作廢之前未用嘅碼，只留最新一張有效
await env.DB.prepare('UPDATE email_otps SET used = 1 WHERE email = ? AND purpose = ? AND used = 0').bind(email, purpose).run();
const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
const codeHash = await coachSha256Hex(purpose + ':' + email + ':' + code);
const id = 'otp_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
await env.DB.prepare('INSERT INTO email_otps (id, email, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?, ?)').bind(id, email, codeHash, purpose, expires).run();
await sendOtpEmail(email, code, purpose, env);
return generic;
} catch (e) { console.warn('otp request error: ' + (e && e.message)); return generic; }
}

// POST /api/account/otp/verify { email, purpose, code } —— login=消耗+出 session；reset=非消耗 peek
async function handleOtpVerify(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body; try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const email = (body.email || '').trim().toLowerCase();
const purpose = body.purpose === 'reset' ? 'reset' : 'login';
const invalid = jsonResponse({ error: 'OTP_INVALID', message: '驗證碼錯誤或已過期' }, 401);
try {
if (purpose === 'reset') {
const r = await checkOtp(email, 'reset', body.code, env, false);   // 非消耗：畀前端進入新密碼步驟
return r.ok ? jsonResponse({ success: true }) : invalid;
}
const r = await checkOtp(email, 'login', body.code, env, true);     // login：消耗 + 出 session
if (!r.ok) return invalid;
await env.DB.prepare('UPDATE user_accounts SET email_verified = 1 WHERE id = ?').bind(r.account.id).run();
const sess = await issueAccountSession(r.account.id, env);
return jsonResponse({ success: true, token: sess.token, expires_at: sess.expires, primary_user_id: r.account.primary_user_id, email });
} catch (e) { return invalid; }
}

// POST /api/account/password/reset { email, code, newPassword } —— 消耗碼 + 改密碼 + 自動登入
async function handlePasswordReset(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body; try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const email = (body.email || '').trim().toLowerCase();
const newPassword = body.newPassword || '';
try {
if (typeof newPassword !== 'string' || newPassword.length < 8) return jsonResponse({ error: 'WEAK_PASSWORD', message: '密碼最少 8 位' }, 400);
const r = await checkOtp(email, 'reset', body.code, env, true);     // 消耗
if (!r.ok) return jsonResponse({ error: 'OTP_INVALID', message: '驗證碼錯誤或已過期' }, 401);
const salt = crypto.getRandomValues(new Uint8Array(16));
const hash = await coachPbkdf2(newPassword, salt, COACH_PBKDF2_ITERATIONS);
await env.DB.prepare('UPDATE user_accounts SET password_hash = ?, salt = ?, iterations = ?, hash_version = ?, email_verified = 1 WHERE id = ?')
.bind(coachBufToB64(hash), coachBufToB64(salt), COACH_PBKDF2_ITERATIONS, COACH_HASH_VERSION, r.account.id).run();
const sess = await issueAccountSession(r.account.id, env);          // 自動登入
return jsonResponse({ success: true, token: sess.token, expires_at: sess.expires, primary_user_id: r.account.primary_user_id, email });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}

// POST /api/admin/set-entitlement { coach_key, email | emails[], course_access } —— coach_key gated
async function handleAdminSetEntitlement(request, env) {
if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
let body; try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
const validKey = env['alexeywong22'] || '';
if (!body.coach_key || !timingSafeEqual(body.coach_key, validKey)) {
await new Promise(r => setTimeout(r, 200));
return jsonResponse({ error: 'Forbidden: invalid coach_key' }, 403);
}
let emails = Array.isArray(body.emails) ? body.emails : (body.email ? [body.email] : []);
emails = emails.map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
if (!emails.length) return jsonResponse({ error: 'Missing email or emails[]' }, 400);
const access = (body.course_access === 1 || body.course_access === true || body.course_access === '1') ? 1 : 0;
try {
const placeholders = emails.map(() => '?').join(',');
const res = await env.DB.prepare('UPDATE user_accounts SET course_access = ? WHERE email IN (' + placeholders + ')').bind(access, ...emails).run();
const updated = (res && res.meta && res.meta.changes) || 0;
return jsonResponse({ success: true, updated, course_access: access });
} catch (e) { return jsonResponse({ error: e.message }, 500); }
}
