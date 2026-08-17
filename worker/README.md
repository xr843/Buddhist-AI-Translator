# 慧译通 API 代理 (Cloudflare Worker)

这个 Worker 干两件事。

**一、中转 MITRA（必需）。** 站点默认用 MITRA 佛典引擎翻译梵／巴／汉／藏，
上游不要任何密钥，但**浏览器不能直连**：`dharmamitra.org` 在实际响应上把
`Access-Control-Allow-Origin: *` 发了两遍（预检 OPTIONS 只发一遍，所以预检能过），
浏览器一律拒收，报

```
The 'Access-Control-Allow-Origin' header contains multiple values '*, *', but only one is allowed.
```

2026-08-14 在 `cat-translate` 与 `primary` 两个端点上都复现过。curl 不检查这个，
所以命令行看着一切正常。**部署这个 Worker 是启用 MITRA 引擎与藏经溯源的前提**，
而且这一步不需要任何密钥。

**二、代管 DeepSeek 密钥（可选）。** 前端只发 `text`、`sourceLang`、`targetLang`，
提示词由 Worker 在服务端构造，避免客户端覆盖或注入自定义 prompt。

## 接口

| 路径 | 用途 | 需要密钥 |
|---|---|---|
| `POST /mitra/translate` | 多本合参翻译，转发到 MITRA `cat-translate` | 否 |
| `POST /mitra/search` | 藏经语料检索，转发到 MITRA `primary` | 否 |
| `POST /translate` | DeepSeek 翻译 | 是（`DEEPSEEK_API_KEY`） |
| `GET /health` | 健康检查 | 否 |

两个 `/mitra/*` 端点都只转发白名单字段，不做透传，免得变成开放代理；
返回前会丢掉 `vector`（几百个浮点数）与 `text_new`。速率限制与 `/translate` 共用。

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

### 6. 配置允许的前端来源

Worker 默认只允许项目的 GitHub Pages 站点：

```text
https://xr843.github.io
```

如果你使用自定义域名，或本地开发需要从 `http://127.0.0.1:8000` 调用
Worker，请在 `worker/wrangler.toml` 的 `[vars]` 中显式配置
`ALLOWED_ORIGINS`。多个 origin 可用逗号或空白分隔：

```toml
[vars]
ALLOWED_ORIGINS = "https://xr843.github.io http://127.0.0.1:8000"
```

只添加你实际使用的前端 origin，不要添加通配域名。

### 7. 前端配置

在 `src/config.js` 中设置 `proxyURL`：

```js
proxyURL: 'https://buddhist-translator-api.<your-subdomain>.workers.dev'
```

设置后前端自动切换为代理模式，MITRA 引擎与自动取回平行本随之可用。
DeepSeek 那条路仍走用户自己的密钥——公共部署不该替所有访客垫付费用，
所以中转默认不配 `DEEPSEEK_API_KEY`，除非你确实想自掏腰包。

⚠️ **CSP 只放行一个具体的 Worker 来源，必须同步修改。**

`index.html` 的 `connect-src` 里写的是本仓库部署的那一个地址：

```html
connect-src 'self' https://api.deepseek.com https://dharmamitra.org https://buddhist-translator-api.lqsxianren.workers.dev;
```

换成你自己的地址后才能用。**这里以前是 `https://*.workers.dev` 通配符，
2026-08-16 收紧掉了**：`workers.dev` 子域任何人都能免费注册，而 CSP 的作用本是
「即使页面被注入脚本，数据也只能发往白名单」——一个人人可注册的通配符等于
把这道防线开了个口子，用户存在 localStorage 里的 DeepSeek 密钥可以被外发到
攻击者自己的 Worker。

代价是：**站点的「配置API」弹窗里填别人的 Worker 地址不再生效**（CSP 写在 meta 里，
运行时改不了）。要用自己的中转，就得 fork 本仓库并同时改这一行。
`tests/ui-source.test.mjs` 有门禁禁止 `connect-src` 里再出现通配符主机。

### 本地开发

用 `wrangler dev` 在本地跑 Worker 时，它是另一个 origin（默认 `http://127.0.0.1:8787`），
所以要做两件事，否则浏览器会静默挡下请求：

```bash
# 1. 让 Worker 接受本地站点的来源
cd worker && npx wrangler@4 dev --port 8787 --var 'ALLOWED_ORIGINS:http://127.0.0.1:8000'
```

```html
<!-- 2. 临时把本地 Worker 加进 index.html 的 connect-src（不要提交这一行） -->
connect-src 'self' ... http://127.0.0.1:8787;
```

代理模式下前端请求体只应包含项目支持的语言代码：

```json
{
  "text": "待翻译文本",
  "sourceLang": "pi",
  "targetLang": "en"
}
```

`sourceLang` 可使用 `auto`、`other` 或 `src/languages.js` 中的其他语言代码；
`targetLang` 必须使用实际目标语言代码，不能使用 `auto` 或 `other`。

## 请求限制

所有端点只接受 `application/json` 请求。单个请求体超过 64KB 时，Worker
会在解析 JSON 前返回 `413`。`/translate` 的 `text` 字段最多 5000 字符，超出返回 `400`；
`/mitra/translate` 的每路写本同样截到 5000 字符，`context` 与 `style_instruction`
截到 4000 字符；`/mitra/search` 最多返回 20 条。

## 架构

```
                    ┌→ DeepSeek API   (密钥在 Worker 里)
浏览器 → Worker ────┤
                    └→ dharmamitra.org (无需密钥；中转是因为对方重复发 CORS 头)
```

## 安全特性

- API 密钥仅存储在 Cloudflare Secrets，不会暴露给前端
- CORS 白名单限制，只允许默认站点和 `ALLOWED_ORIGINS` 显式配置的来源调用
- 本地开发来源需显式配置，例如 `http://127.0.0.1:8000`
- Worker 服务端构造 DeepSeek prompt，不信任客户端 prompt 字段
- Worker 校验 `sourceLang` 和 `targetLang`，拒绝未知语言代码
- `/mitra/*` 只转发白名单字段（四路写本、`focus`、`target_language`、`context`、
  `style_instruction`），未知字段一律丢弃，`focus` 等枚举值不合法时回落到默认值，
  所以这里不会变成一个可以任意构造上游请求的开放代理
- 请求体大小和文本长度限制
- 基于 KV 的 IP 速率限制（公开共享部署必需），`/mitra/*` 与 `/translate` 共用同一配额

## 容量上限与它的成因

免费额度里**先撞上的不是 Workers 的 10 万请求/天，而是 KV 的 1,000 次写入/天**——
差两个数量级。因为限流器每次放行的请求都要写一次 KV 记账。

| 使用强度 | 每天能服务 |
|---|---|
| 每人试译 3 段 | 约 330 人 |
| 每人试译 10 段 | 约 100 人 |
| 一人满速（30 次/分钟） | **33 分钟耗尽全天配额** |

⚠️ **别指望「按分钟分桶」能解决。** KV 没有原子自增，任何基于它的计数都是
每请求一次写入——把键名从 `rate:{ip}` 换成 `rate:{ip}:{分钟}` 一次写入也省不掉。
要真正提容量只能换存储（例如 Cloudflare 的 Cache API，无每日写入配额），
代价是 Cache 按机房隔离、绕过更容易。这笔账值不值得，等有真实流量再算。

**配额耗尽不会让站点停摆**：`checkRateLimit` 的 catch 是 fail-open，
计数器坏了照常翻译，只是那段时间没有限流。这里曾经是 fail-closed，
反而给了攻击者一个廉价的拒绝服务手段——1,000 次请求换全站当天下线。
`tests/worker.test.mjs` 有两条测试钉着这个行为。

**看真实用量**：Cloudflare 后台 → Workers → `buddhist-translator-api`。
从外部量不到，只能在那里看。
