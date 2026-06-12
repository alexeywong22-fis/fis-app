#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// FIS 一致性 eval harness — 量度「現狀」(temperature 0.1) 嘅真實 tier flip rate。
// ⚠️ 唔改任何 worker / generationConfig。1:1 複製 app 真實 call：
//    POST /api/fis-step1 {images:[4 data URL]} → result（圖→文字）
//    POST /api/fis-step2 {step1Result}         → parsed.fascialLines（文字→tier）
//    兩個 endpoint 都 read-only（零 D1 寫入），跑 N 次唔污染數據。
//    gender 唔送 API、唔影響 tier，只作 baseline.json 記錄。
//
// 用法：
//    node eval/consistency.js [N] [男|女] [--fast]
//      N        跑幾多次（預設 10）
//      男|女    gender（預設 女，純記錄）
//      --fast   step1 只跑一次、step2 重用 ×N（隔離「分級引擎」、快、controlled）
//               預設（唔加）= full pipeline 每 iter（真‧end-to-end，連 step1 文字飄移）
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const API_BASE = 'https://fis-app.alexeywong22.workers.dev';
const PHOTO_DIR = path.join(__dirname, 'photos');
const OUT = path.join(__dirname, 'baseline.json');

// 4 張相，順序同 app 一致：① 正面 ② 側面 ③ 背面 ④ 站姿前彎（側面）
const PHOTOS = [
  { slot: '正面',     bases: ['1-front', 'front'] },
  { slot: '側面',     bases: ['2-side', 'side'] },
  { slot: '背面',     bases: ['3-back', 'back'] },
  { slot: '前彎側面', bases: ['4-bend', '4-forwardbend', 'bend', 'forwardbend'] },
];
const EXTS = ['.jpg', '.jpeg', '.png'];

const LINES = [
  { key: 'deepFrontLine',        name: '深前線' },
  { key: 'lateralLine',          name: '側線' },
  { key: 'spiralLine',           name: '螺旋線' },   // ⭐ 已知踩界、會跳
  { key: 'superficialBackLine',  name: '淺背線' },
  { key: 'superficialFrontLine', name: '淺前線' },
];
const SPOTLIGHT = 'spiralLine';

// ── CLI ──
const argv = process.argv.slice(2);
let N = 10, gender = '女', fast = false;
for (const a of argv) {
  if (a === '--fast' || a === '--step2-only') fast = true;
  else if (/^\d+$/.test(a)) N = parseInt(a, 10);
  else if (a === '男' || a === '女') gender = a;
  else if (a.startsWith('--n=')) N = parseInt(a.slice(4), 10) || N;
  else if (a.startsWith('--gender=')) gender = a.slice(9);
}

function findPhoto(p) {
  for (const b of p.bases) for (const e of EXTS) {
    const f = path.join(PHOTO_DIR, b + e);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// 用 macOS sips 複製 app 壓縮（長邊 1200px、JPEG q80）。非 mac / sips fail → 原圖 fallback。
function toDataUrl(file) {
  try {
    const tmp = path.join(os.tmpdir(), 'fis-eval-' + Date.now() + '-' + path.basename(file) + '.jpg');
    execFileSync('sips', ['-Z', '1200', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', file, '--out', tmp], { stdio: 'ignore' });
    const b64 = fs.readFileSync(tmp).toString('base64');
    fs.unlinkSync(tmp);
    return 'data:image/jpeg;base64,' + b64;
  } catch (e) {
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    console.log(`   ⚠️ sips 壓縮失敗（${e.message}），改送原圖 ${path.basename(file)}`);
    return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function postJSON(pathname, body, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API_BASE + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, data };
  } finally { clearTimeout(t); }
}

// retry 最多 3 次（503 / 錯誤 / 逾時），全失敗 → null
async function withRetry(label, fn) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await fn(); }
    catch (e) {
      console.log(`   · ${label} attempt ${attempt}/3 失敗：${e.message}`);
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  return null;
}

async function getStep1(images) {
  return withRetry('step1', async () => {
    const r = await postJSON('/api/fis-step1', { images }, 90000);
    if (r.status !== 200 || !r.data || !r.data.result) {
      throw new Error('step1 HTTP ' + r.status + ' ' + (r.data && (r.data.error || r.data.message) || ''));
    }
    return r.data.result;
  });
}

async function getStep2(step1Result) {
  return withRetry('step2', async () => {
    const r = await postJSON('/api/fis-step2', { step1Result }, 60000);
    if (r.status !== 200 || !r.data || !r.data.parsed || !r.data.parsed.fascialLines) {
      throw new Error('step2 HTTP ' + r.status + ' ' + (r.data && (r.data.error || r.data.message) || 'no parsed'));
    }
    const fl = r.data.parsed.fascialLines;
    const out = {};
    for (const l of LINES) {
      const d = fl[l.key] || {};
      out[l.key] = { status: d.status || '—', stage: d.stage || '—' };
    }
    return out;
  });
}

function tierLabel(status) {
  return status === '優先關注' ? '🔴優先關注'
    : status === '發展中' ? '🟡發展中'
    : status === '狀態良好' ? '🟢狀態良好'
    : ('❓' + status);
}

(async function main() {
  // 1. 揾 + 壓縮 4 張相
  const files = [];
  for (const p of PHOTOS) {
    const f = findPhoto(p);
    if (!f) {
      console.error(`❌ 揾唔到「${p.slot}」相片。預期檔名（任一）：${p.bases.map(b => b + '.jpg').join(' / ')}　放喺 ${PHOTO_DIR}`);
      process.exit(1);
    }
    files.push({ slot: p.slot, file: f });
  }
  console.log(`📷 4 張相：${files.map(f => `${f.slot}=${path.basename(f.file)}`).join('，')}`);
  console.log(`⚙️  sips 壓縮中（長邊 1200px / JPEG 80%，1:1 複製 app）…`);
  const images = files.map(f => toDataUrl(f.file));

  console.log(`▶️  N=${N}　gender=${gender}（唔送 API、唔影響 tier）　mode=${fast ? 'fast（step1 ×1 + step2 ×N，隔離分級引擎）' : 'full（step1→step2 每 iter，真 end-to-end）'}`);
  console.log(`    endpoint：${API_BASE}（read-only）　config：temperature 0.1（現狀，未改 worker）\n`);

  // fast mode：先攞一次 step1Result
  let fixedStep1 = null;
  if (fast) {
    console.log('🔒 fast mode：先跑 step1 一次（之後 N 次共用同一 step1Result）…');
    fixedStep1 = await getStep1(images);
    if (!fixedStep1) { console.error('❌ step1 三次都失敗，無法繼續'); process.exit(1); }
    console.log('   ✓ step1Result 已鎖定\n');
  }

  // 2. 跑 N 次
  const runs = [];
  let errors = 0;
  for (let i = 1; i <= N; i++) {
    process.stdout.write(`▷ iter ${i}/${N} … `);
    let lines = null;
    if (fast) {
      lines = await getStep2(fixedStep1);
    } else {
      const s1 = await getStep1(images);
      if (s1) lines = await getStep2(s1);
    }
    if (lines) {
      runs.push(lines);
      console.log('✓ ' + LINES.map(l => l.name + ':' + lines[l.key].status).join('  '));
    } else {
      errors++;
      console.log('✗ error（唔當 flip）');
    }
  }

  // 3. 統計
  const successN = runs.length;
  console.log(`\n${'='.repeat(64)}`);
  console.log(`📊 FIS tier 一致性基線　成功 ${successN}/${N}（error ${errors}）`);
  console.log(`${'='.repeat(64)}`);
  const perLine = {};
  for (const l of LINES) {
    const counts = {};
    for (const run of runs) {
      const s = run[l.key].status;
      counts[s] = (counts[s] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = entries[0] ? entries[0][1] : 0;
    const consistency = successN ? Math.round(top / successN * 100) : 0;
    const jumped = consistency < 100;
    const dist = entries.map(([s, c]) => `${tierLabel(s)} ×${c}`).join('  /  ');
    const mark = (l.key === SPOTLIGHT ? '⭐' : '  ');
    const tag = jumped ? `⚠️ ${consistency}% — 跳！` : `✅ ${consistency}%`;
    console.log(`${mark} ${l.name}\t${dist}\t→ ${tag}`);
    perLine[l.key] = { name: l.name, distribution: counts, consistency, jumped };
  }
  console.log(`${'='.repeat(64)}`);
  if (perLine[SPOTLIGHT]) {
    const sp = perLine[SPOTLIGHT];
    console.log(`⭐ 螺旋線（已知踩界）：一致 ${sp.consistency}%　${sp.jumped ? '→ 確認會跳' : '→ 今次穩定'}`);
  }
  const flippy = LINES.filter(l => perLine[l.key].jumped).map(l => `${perLine[l.key].name}(${perLine[l.key].consistency}%)`);
  console.log(flippy.length ? `🔁 會跳嘅線：${flippy.join('、')}` : `🟢 全部線 100% 一致`);

  // 4. 存 baseline.json
  const baseline = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    config: 'temperature 0.1（現狀，未改 worker / generationConfig）',
    mode: fast ? 'fast (step1 once, step2 xN — 隔離分級引擎)' : 'full pipeline (fis-step1 -> fis-step2 每 iter)',
    gender, genderNote: 'gender 唔送 API、唔影響 tier，只作記錄',
    N, successN, errors,
    photos: files.map(f => ({ slot: f.slot, file: path.basename(f.file) })),
    perLine,
    rawRuns: runs,
  };
  fs.writeFileSync(OUT, JSON.stringify(baseline, null, 2));
  console.log(`\n💾 已存 ${OUT}`);
})().catch(e => { console.error('💥 harness 出錯：', e); process.exit(1); });
