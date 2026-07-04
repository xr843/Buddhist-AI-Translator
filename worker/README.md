# 慧译通 API 代理 (Cloudflare Worker)

将 DeepSeek API 密钥安全存储在服务端，前端无需暴露密钥。浏览器只发送
`text`、`sourceLang` 和 `targetLang`，翻译提示词由 Worker 在服务端构造，
避免客户端覆盖或注入自定义 prompt。

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

### 5. 启用速率限制

```bash
wrangler kv namespace create RATE_LIMIT_KV
# 将返回的 id 填入 wrangler.toml 中的 kv_namespaces 配置
```

面向公网或多人共享的部署必须绑定 `RATE_LIMIT_KV`。未绑定 KV 时 Worker
会放行请求，适合个人临时测试，但不适合公开共享的代理服务。

### 6. 前端配置

在 `src/config.js` 中设置 `proxyURL`：

```js
proxyURL: 'https://buddhist-translator-api.<your-subdomain>.workers.dev'
```

设置后前端将自动切换为代理模式，不再需要用户输入 API 密钥。

代理模式下前端请求体只应包含：

```json
{
  "text": "待翻译文本",
  "sourceLang": "源语言",
  "targetLang": "目标语言"
}
```

## 架构

```
浏览器 → Cloudflare Worker → DeepSeek API
         (密钥在这里)
```

## 安全特性

- API 密钥仅存储在 Cloudflare Secrets，不会暴露给前端
- CORS 白名单限制，只允许指定域名调用
- 本地测试默认允许 `http://localhost:8000` 与 `http://127.0.0.1:8000`
- Worker 服务端构造 DeepSeek prompt，不信任客户端 prompt 字段
- 请求体大小和文本长度限制
- 基于 KV 的 IP 速率限制（公开共享部署必需）
