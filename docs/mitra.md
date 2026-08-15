# MITRA 引擎接入

慧译通默认走 **MITRA**（Dharmamitra 项目，东北大学）的佛典专用引擎，
不需要用户自备任何密钥。DeepSeek 退为可选项，只在 MITRA 不受理的语种对上使用。

## 为什么是默认

原先没有 DeepSeek 密钥的访客点「翻译」，只能得到一段术语提示，产品是不可用的。
MITRA 的两个接口都**无需鉴权**，质量又比通用模型更对口，所以拿它做默认引擎，
访客不必自备任何密钥。

## 为什么必须过 Worker 中转

一开始的设计是纯前端直连——curl 看到 `Access-Control-Allow-Origin: *`，
看着完全可行。**真浏览器一跑就翻了：**

```
Access to fetch at 'https://dharmamitra.org/api-search/cat-translate/v1/translate'
has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains
multiple values '*, *', but only one is allowed.
```

对方在**实际响应**上把这个头发了两遍（预检 OPTIONS 只发一遍，所以预检能过），
浏览器一律拒收。2026-08-14 在 `cat-translate` 与 `primary` 两个端点上都复现。

curl 不检查重复的 ACAO，所以命令行永远看不出问题——这类事只有真浏览器照得出来。

于是 MITRA 的请求改走本项目的 Cloudflare Worker（`worker/worker.js` 的 `/mitra/*`），
中转本身不需要任何密钥，部署一次即可。前端的 `MITRA_CONFIG.allowDirect` 记着这件事：
上游把重复的响应头去掉之后，把它改成 `true` 就能省掉中转。

## 两个接口

参数依据 Dharmamitra 官方公开的 agent starterpack
（<https://github.com/dharmamitra/dharmamitra-claude-code-agent>）。

### `POST /api-search/cat-translate/v1/translate`

多本合参翻译。同一段落的多语种写本一起送入，产出一份权衡各本的译文。

| 字段 | 说明 |
|---|---|
| `input_tibetan` / `input_chinese` / `input_pali` / `input_sanskrit` | 四路写本，至少一路非空 |
| `focus` | `equal` \| `tibetan` \| `chinese` \| `pali` \| `sanskrit` |
| `target_language` | **自由文本标签**，不是 ISO 代码：`"english"`、`"modern chinese"` |
| `context` | 术语表、上文译文、体例说明 |
| `style_instruction` | 译风指令，模型**逐字照读**，所以要写成对人类译者说话的口气 |

返回 `{"translation": "..."}`。

实测（2026-08-14，本机）：单本汉→英约 1.4 秒。官方文档说长输入可能到 60 秒，
上游 Cloudflare 在 100 秒截断，所以 `MITRA_CONFIG.translateTimeoutMs` 设 95 秒，
**不要往下调**（`tests/mitra.test.mjs` 有一条断言守着它）。

### `POST /api-search/primary/`

藏经语料检索，用于「出处溯源」。返回经名、`segmentnr` 与阅读室深链。

- `do_ranking: false` —— 官方文档说最终 ranker 是给浏览器 UI 调的，程序化取用应关掉。
- 返回里的 `vector`（几百个浮点数）与 `text_new` 在 `src/mitra.js` 里就丢掉。
- 引用一律直接用返回的 `src_link`，**不要自己拼 URL**。

## 语种对怎么路由

`selectEngine()` 的规则：

- 源语言能映射到四路写本之一（文言文／梵／巴／藏，或 `auto` 下按字形判出来），
  **且**目标语言在 MITRA 的标签表里（现代汉语、英、德、法、日、韩……）→ 走 MITRA。
- 否则走 DeepSeek。典型情况：译入文言文、译入古典语言、从现代语言译出。

`auto` 下的字形判断只认藏文、天城体、汉字三种。**拉丁字母一律不猜**——
IAST 梵文、巴利文、英文同形，猜错的代价比不猜大。

## 用量与礼节

这两个接口是对方免费公开的。产品侧做了三件事减少无谓请求：
按（原文＋语种对＋译风＋引擎）缓存、失败不自动重试、术语索引加载失败不阻塞翻译。

**公开上线前应当致信 `dharmamitra-project@gmail.com` 告知**，
这既是上游 README 对数据使用的请求，对 API 用量也是应有的礼节。
