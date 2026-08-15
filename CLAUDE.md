# 在这个仓库里干活之前先读这一页

慧译通是**纯静态前端**（原生 ES 模块，无框架无构建）+ 一个可选的 Cloudflare Worker。
`npm run verify` 串起语法检查、Worker dry-run、术语校验、**真浏览器冒烟**和 Node 测试。
动任何东西之前先跑一遍它。

下面每一条都是实际踩过才知道的，写在这里免得再踩一次。

## ⚠️ 浏览器直连不了 dharmamitra.org

`cat-translate` 与 `primary` 两个端点在**实际响应**上把 `Access-Control-Allow-Origin`
发了**两遍**（预检 OPTIONS 只发一遍，所以预检能过），浏览器一律拒收：

```
The 'Access-Control-Allow-Origin' header contains multiple values '*, *', but only one is allowed.
```

**`curl` 不校验重复的 CORS 头**，所以命令行永远看不出问题——这个 bug 骗过一整套按
「纯前端直连」写完的实现，直到真浏览器一跑才翻车。判据：

```bash
curl -sS -D - -o /dev/null -X POST https://dharmamitra.org/api-search/primary/ \
  -H 'Origin: https://example.org' -H 'Content-Type: application/json' \
  -d '{"search_input":"空"}' | grep -ci '^access-control-allow-origin'   # 是 2 就完了
```

所以 MITRA 一律走 `worker/worker.js` 的 `/mitra/*` 中转。前端 `MITRA_CONFIG.allowDirect`
记着这件事，**上游修好之后改成 `true` 就能省掉中转**。

**推论：要让 MITRA 可用，必须先 `cd worker && wrangler deploy`（不需要任何密钥）**，
再把 URL 填进 `src/config.js` 的 `proxyURL`，或在站点设置弹窗里填。未配置时自动退回 DeepSeek。

## ⚠️ 上游有限流

实测 2026-08-15：约 **10 次请求/分钟**后回 429，**不带 `Retry-After`**，约 80 秒恢复。
整部经模式每块间隔 6 秒并对 429 退避（`src/document.js` 的 `MIN_INTERVAL_MS` / `RETRY_DELAY_MS`）。
**别为了跑快把间隔调小**——那是别人的免费接口。

## ⚠️ Node 的 fetch 默认不读代理环境变量

`curl` 读 `https_proxy`，Node 的 fetch 不读。在走代理的机器上会出现
「curl 通、脚本报 `fetch failed`」。跑 `eval/` 下的脚本要加 `NODE_USE_ENV_PROXY=1`。

## ⚠️ `[hidden]` 会被 `display: grid/flex` 盖掉

浏览器给 `[hidden]` 的默认 `display:none` 优先级低于任何带类名的 `display` 声明。
`styles.css` 顶部有一条 `[hidden]{display:none!important}` 兜着，**别删**。
同理，放进 `.translation-area`（`1fr 90px 1fr` 栅格）的面板必须 `grid-column: 1/-1`，
否则会被挤进中间那条 90px 的窄列。

## 术语数据分两层，别混

| | `src/terms.json` | `src/data/lexicon.json` |
|---|---|---|
| 来源 | 人工编写，带解释 | 平行语料自动挖掘，带出现次数与大正藏经号 |
| 规模 | 55 条 | 8,610 条 |
| 加载 | 随首屏 | 首次翻译时按需 |

`lexicon.json` 的两道过滤（必须有梵文原语、首选原语占比 ≥25%）是**抽样量出来的**：
不加过滤时随机抽样约一半是句法碎片，加了之后独立抽 40 条复核精确率 87.5%。
数字记在产物 `meta.sampledPrecision` 与 `docs/lexicon.md`。**要改阈值，先重做抽样。**

## 许可合规有门禁，改署名会红

本仓库**再分发**了 CC BY 4.0 的派生数据。义务落点有四处：站点页脚、`README.md`、
`NOTICE.md`、`lexicon.json` 的 `meta`。`tests/data-license.test.mjs` 八条门禁盯着它们，
包括：许可必须给全文链接（不能只写标签）、必须声明已改编、声明出处必须可复核、
「上线前来信告知」必须标为**请求**而不是许可条件。改动署名相关文案时同步这四处。

⚠️ `mitra-parallel` 是 **CC BY-SA 4.0**，会传染分发条件。目前**未使用**，门禁盯着，
日后若引入需重新评估本项目的分发条件。

## 测试约定

- **`tests/ui-source.test.mjs` 用正则钉死了 `src/ui.js` 的若干代码形状**
  （`initializeUI` 末尾四个调用的顺序、`handleTranslate` 开头的 `translateBtn.disabled` 判断、
  剪贴板与下载的写法）。重构这两个函数时它会红，那不是误报，是提醒你别改坏既有行为。
- **`index.html` 的两个语种下拉必须与 `src/languages.js` 的 `languageMap` 完全一致**，有测试比对。
- **加了闸门就要做变异测试**：把已知的坏值放回去，确认它真的会红。
  实际抓到过摆设——「最长匹配」那条测试用的词对不共享起始位置，退化成逐字匹配照样通过。

## 验收怎么做

`eval/` 下是整部经翻译的 A/B 验收：同一部经、同一引擎译风，**只改「回不回喂上文」一个变量**
跑两遍再比。`eval/drift-check.mjs` **只出候选与数字，不下判断**，标 ⚠️ 的要人工看译文。
结论与三个已知测量缺陷见 `eval/RESULTS.md`。

新加语料必须**独立核对**并把过程写进 `meta.json` 的 `verification`——
核对要挑**独特句**，用「所以者何？」这类套语反查会 0 命中，那是取样问题不是数据问题。

## 上游资源速查

- 接口与参数依据：<https://github.com/dharmamitra/dharmamitra-claude-code-agent>
- 术语数据上游：<https://github.com/dharmamitra/dharmamitra-lexicon>（CC BY 4.0）
- 详细笔记：`docs/mitra.md`、`docs/lexicon.md`、`docs/document-mode.md`、`NOTICE.md`
