// fis-worker.js — Cloudflare Worker for FIS App
// Accepts FormData (files) from frontend, converts to base64, sends to Gemini
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
    text: `你係一位專業體態評估師及筋膜線治療師。請根據以下圖片，從FIS體態特徵訓練系統嘅筋膜線理論角度進行全面體態分析：
1. **姿勢偏差評估**：觀察頭部前傾、肩膀高低、脊椎側彎、骨盆傾斜、膝蓋對齊、足弓狀態
2. **筋膜線張力分析**：評估深前線、側線、螺旋線、淺背線、淺前線各線嘅張力與縮短狀態
3. **主要問題識別**：列出最明顯嘅3-5個體態問題，每個問題說明涉及嘅筋膜線
4. **訓練激活建議**：針對每個問題，提供具體嘅筋膜激活或矯正動作（包括組數與時間）
5. **注意事項**：說明哪些常見訓練動作可能加劇問題
請用繁體中文（香港口語書面語）回答，條理清晰，實用易懂。`
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
const geminiResult = await callGemini(parts, GEMINI_API_KEY);
if (geminiResult.error) {
return jsonResponse(geminiResult, 502);
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
    text: `你係FIS體態特徵訓練系統嘅AI分析引擎。根據以下體態分析數據，輸出一份精準的JSON報告。
體態分析數據：
${step1Result.substring(0, 1500)}
嚴格要求：只輸出純JSON，唔可以有任何其他文字、說明或markdown。
JSON格式如下（status只能係「優先關注」或「狀態良好」，stage只能係「Stage 1」或「Stage 2」）：
{
  "fascialLines": {
    "deepFrontLine": { "status": "優先關注", "stage": "Stage 1" },
    "lateralLine": { "status": "狀態良好", "stage": "Stage 2" },
    "spiralLine": { "status": "優先關注", "stage": "Stage 1" },
    "superficialBackLine": { "status": "優先關注", "stage": "Stage 1" },
    "superficialFrontLine": { "status": "狀態良好", "stage": "Stage 2" }
  },
  "recommendations": {
    "breathing": "呼吸訓練：透過90/90呼吸重置橫膈膜張力，激活深前線核心。",
    "trainingPlan": "訓練計劃：優先釋放緊繃筋膜線，再激活無力肌群，循序漸進建立穩定性。",
    "startingPoint": "訓練起點：從最基礎嘅核心穩定同呼吸模式開始，確保動作模式正確。"
  }
}
根據分析數據，精準評估每條筋膜線狀態，recommendations每句控制在30字以內。只輸出JSON。`
}];
const geminiResult = await callGemini(parts, GEMINI_API_KEY);
if (geminiResult.error) {
return jsonResponse(geminiResult, 502);
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
const geminiResult = await callGemini(parts, GEMINI_API_KEY);
if (geminiResult.error) {
return jsonResponse(geminiResult, 502);
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
const geminiResult = await callGemini(parts, GEMINI_API_KEY);
if (geminiResult.error) {
return jsonResponse(geminiResult, 502);
}
return jsonResponse({ result: geminiResult.text });
}

async function callGemini(parts, apiKey) {
const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
const body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192
}
};
let geminiRes;
try {
geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
});
} catch (err) {
return { error: 'Failed to reach Gemini API: ' + err.message };
}
if (!geminiRes.ok) {
const errText = await geminiRes.text();
let errDetail;
try { errDetail = JSON.parse(errText); } catch { errDetail = { raw: errText }; }
return {
      error: 'Gemini API error ' + geminiRes.status,
      status: geminiRes.status,
      detail: errDetail
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
return { text };
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
        ai_parsed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
id, userId,
stageNum(dl.stage), stageNum(ll.stage), stageNum(sl.stage),
stageNum(sbl.stage), stageNum(sfl.stage),
JSON.stringify(parsed)
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
        MAX(pl.logged_at) as last_active
      FROM users u
      LEFT JOIN fascia_tests ft ON ft.user_id = u.id
      LEFT JOIN progress_logs pl ON pl.user_id = u.id
      LEFT JOIN pain_diagnoses pd ON pd.user_id = u.id
      GROUP BY u.id
      ORDER BY last_active DESC NULLS LAST
    `).all();
return jsonResponse({ success: true, users: users.results || [] });
} catch(e) {
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
return jsonResponse({
user,
      summary: { totalTrainingDays: user.total_training_days || totalLogs, totalFunctionalTests: functionalTests.length, totalPainDiagnoses: painDiagnoses.length, avgMuscleActivation: avgActivation, backCompensationRate: compensationRate !== null ? compensationRate + '%' : null, painHotspots },
      dataSection: { logs, stats: { avgActivation, compensationRate } },
      fisSection: { baseline: functionalTests[functionalTests.length-1]||null, latest: functionalTests[0]||null, history: functionalTests },
      rxSection: { diagnoses: painDiagnoses, hotspots: painHotspots, active: painDiagnoses.filter(p=>p.status==='active').length },
      weeklySection: { assessments: weeklyResult.results || [] }
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
const COACH_PBKDF2_ITERATIONS = 210000;   // 實測 ~25ms；逐行存 iterations，可隨時升降（若 Worker CPU 超限回落 150000）
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
