# FIS 一致性 eval harness

量度**現狀**（`temperature 0.1`，未改 worker）下，5 條筋膜線 tier（🔴優先關注／🟡發展中／🟢狀態良好）run-to-run 嘅 **flip rate**，攞基線。**唔改任何 worker / generationConfig** —— 純量度。

## 1. 放測試相

放 **4 張**相入 `eval/photos/`，檔名（順序同 app 一致）：

| 槽位 | 檔名（任一即可） |
|---|---|
| ① 正面     | `1-front.jpg` |
| ② 側面     | `2-side.jpg` |
| ③ 背面     | `3-back.jpg` |
| ④ 站姿前彎（側面） | `4-bend.jpg` |

- 支援 `.jpg` / `.jpeg` / `.png`。
- harness 會用 macOS `sips` 自動壓縮到「長邊 1200px / JPEG 80%」，**1:1 複製 app 嘅 `compressImage`**，唔使自己 resize。
- ⚠️ `eval/photos/` 入面嘅相**唔會 commit**（私人身體相，已 `.gitignore`）。

## 2. 跑

```bash
node eval/consistency.js              # N=10、gender=女、full pipeline
node eval/consistency.js 20 男        # N=20、gender=男
node eval/consistency.js 15 --fast    # step1 跑一次、step2 重用 ×15（隔離分級引擎、快）
```

- `N`：跑幾多次（預設 10）
- `男｜女`：gender —— **唔送 API、唔影響 tier**，淨係寫入 baseline.json 作記錄
- `--fast`：step1 只跑一次、step2 重用 N 次。隔離「文字→tier 分級引擎」（controlled，最啱用嚟比較 temp 0.1 vs 0）。**唔加** = full pipeline 每次（真‧end-to-end，連 step1 圖→文字飄移都計入）

## 3. 睇結果

- 終端 print 每條線嘅 tier 分佈 + 一致 %；螺旋線（已知踩界）有 ⭐ 標示。
- 完整結果存 `eval/baseline.json`。

例：
```
⭐ 螺旋線   🟡發展中 ×6  /  🔴優先關注 ×4   → ⚠️ 60% — 跳！
   深前線   🔴優先關注 ×10                 → ✅ 100%
```

## 註

- 只 call `/api/fis-step1` + `/api/fis-step2`，兩個都 **read-only（零 D1 寫入）**，跑幾多次都唔污染數據。
- 503 / 錯誤 / 逾時：每步 retry 最多 3 次，仍失敗該次標 `error`，**唔當 flip**（一致 % 只計成功次數）。
