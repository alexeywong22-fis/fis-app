# 部署 fis-worker.js 到 Cloudflare

## 一次性設定

1. **Node.js ≥ 22**（wrangler 要求）。用 nvm：
   ```bash
   nvm install 22 && nvm use 22   # 專案有 .nvmrc，直接 nvm use 亦可
   ```
2. **安裝依賴**（會裝 wrangler）：
   ```bash
   npm install
   ```
3. **登入 Cloudflare**（一次即可，會開瀏覽器授權）：
   ```bash
   npx wrangler login
   ```
4. **填 D1 binding**：行 `npm run d1:list` 攞 database 嘅 name 同 id，
   再填入 `wrangler.toml` 嘅 `database_name` / `database_id`。
5. **確認 secrets** 已存在（跨部署自動保留，唔使每次設定）：
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put alexeywong22     # 教練密碼（每個教練 username 一個）
   ```
   ⚠️ 如果呢啲值目前喺 Dashboard 係「明文 Variable」，部署前要轉做 Secret，
   否則 wrangler deploy 會移除佢哋。

## 之後每次部署

```bash
npm run deploy
```

## 其他指令

```bash
npm run dev      # 本地測試
npm run tail     # 睇 live log
npm run whoami   # 確認登入帳號
```

## 驗證部署成功

```bash
curl -X POST https://fis-app.alexeywong22.workers.dev/api/user/init \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<你嘅現有 userId>"}'
# response 應包含 "name": "..."
```
