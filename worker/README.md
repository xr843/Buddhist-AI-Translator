# 慧译通 API 代理 (Cloudflare Worker)

将 DeepSeek API 密钥安全存储在服务端，前端无需暴露密钥。

## 部署步骤

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 部署 Worker

```bash
cd worker
wrangler deploy
```

### 4. 配置 API 密钥

```bash
wrangler secret put DEEPSEEK_API_KEY
# 按提示输入你的 DeepSeek API 密钥
```

### 5. （可选）启用速率限制

```bash
wrangler kv namespace create RATE_LIMIT_KV
# 将返回的 id 填入 wrangler.toml 中的 kv_namespaces 配置
```

### 6. 前端配置

在 `src/config.js` 中设置 `proxyURL`：

```js
proxyURL: 'https://buddhist-translator-api.<your-subdomain>.workers.dev'
```

设置后前端将自动切换为代理模式，不再需要用户输入 API 密钥。

## 架构

```
浏览器 → Cloudflare Worker → DeepSeek API
         (密钥在这里)
```

## 安全特性

- API 密钥仅存储在 Cloudflare Secrets，不会暴露给前端
- CORS 白名单限制，只允许指定域名调用
- 请求体大小和文本长度限制
- 可选的 IP 速率限制（需要 KV）
