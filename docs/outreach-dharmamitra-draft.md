# 致 Dharmamitra 的去信草稿（**已定稿，决定暂不发送**）

> **2026-08-16 决定：暂不发送。**
> 核查后确认这封信只剩两件事——给对方报两个 bug（浏览器连不上他们的接口、
> v2 许可指针指向一个不存在的段落）。**我们这边无所求**：
> v2 数据本来就能公开下载，而慧译通已改走 fojin 的 `get_parallels`、不碰原始数据。
> 既然不是我们需要什么，就没必要主动开一条对外沟通线。
>
> 草稿保留原样。若日后真要引入 v2 数据（那时 `NOTICE.md` 的 `UNVERIFIED` 标记
> 就必须解决），直接拿这份发即可，内容不用重写。

收件人：dharmamitra-project@gmail.com
发信人：**用 gmail 那个地址发**（收件方是 @gmail.com，QQ 邮箱发往 Gmail 常进垃圾箱；
对方是学术项目，Gmail 更合场合。具体地址不写进仓库——这是公开仓库，
提交进去就永久留在公开历史里；而发信时 From 本来就是它，签名里不必重复）
状态：**已定稿，暂不发送**（理由见文首）

## 先说清楚这封信不解决什么

**拿到 v2 数据不需要发这封信。** `dharmamitra/mitra-parallel` 是公开仓库，
`v2/zh-sa_matches.ndjson.gz` 现在就能匿名下载（2026-08-16 实测 HTTP 206）。
不存在申请门槛。

信要解决的是**能不能合法使用/再分发**——v2 的许可声明是悬空的
（`v2/README` 说「跟随根 README」，而根 README 全文没有许可字样）。

## 而且慧译通这边其实已经不需要它了

起草这封信时的计划是「自己下载语料、自建平行索引」。**那个计划已作废**：
慧译通现在调 fojin 的 `get_parallels`（PR #87 已上线），
**根本不接触 mitra-parallel 数据本身**。

所以 v2 的许可问题现在是 **fojin 那边的事**（fojin 摄入了这份语料并对外服务派生结果），
不是慧译通的事。信照发仍有价值，但性质变了：不是「请批准我们使用」，
而是「你们的许可指针坏了，顺手告诉你们一声」。

---

Subject: A broken licence pointer in MITRA-parallel, and a CORS detail

Dear Dharmamitra team,

I maintain a small open-source front-end
(https://xr843.github.io/Buddhist-AI-Translator/) that translates Buddhist
passages through your `cat-translate` endpoint, and I run fojin
(https://fojin.ai), which hosts read-only Buddhist-canon tools over MCP and
builds on your parallel corpus. Both carry attribution to MITRA. Thank you for
making this work public.

Two things, neither of them a request for permission.

**1. A CORS detail you may not know about.** Browsers cannot call
`dharmamitra.org/api-search/cat-translate/` or `/api-search/primary/` directly.
The actual responses carry `Access-Control-Allow-Origin` twice, so every browser
rejects them with "contains multiple values '*, *'". The preflight OPTIONS sends
it only once, so preflight passes and the failure surfaces only on the real
request — and `curl` does not validate duplicate CORS headers, so it is
invisible from the command line. Reproduced 2026-08-15:

```
$ curl -sS -D - -o /dev/null -X POST https://dharmamitra.org/api-search/primary/ \
    -H 'Origin: https://example.org' -H 'Content-Type: application/json' \
    -d '{"search_input":"空"}' | grep -ci '^access-control-allow-origin'
2                      # same for /api-search/cat-translate/v1/translate
                       # the OPTIONS preflight returns 1, which is why it passes
```

We work around it with a relay, so nothing is broken on our side — but a
one-line fix would let any browser client talk to you directly.

**2. The licence pointer for `mitra-parallel` v2 appears to be broken.**
`v2/README.md` says "License and citation follow the repository root README",
but the root `README.md` has no licence section, and the repository has no
`LICENSE` file (we checked the repository root, `v1/`, and `v2/`). The one clear
statement is in `v1/README.md` — CC BY-SA 4.0.

We assume v2 carries the same terms, but did not want to assume that on your
behalf, so we have marked v2 as UNVERIFIED in our own NOTICE rather than restate
a licence you have not stated. A line in the root README would settle it for
everyone downstream.

**One question, if you have a moment.** Does `/api-search/primary/` support
cross-language retrieval? We send `filter_target_language: "all"` and
consistently get same-language results only — twelve of twelve Chinese hits even
for the Heart Sūtra, which certainly has Sanskrit and Tibetan witnesses in your
corpus. If there is a parameter we are missing, that would be useful to know;
if it is simply not a feature, no problem, we resolve parallels another way.

Happy to file the CORS finding as a GitHub issue instead if that suits you
better.

With thanks and respect for the work,

Ren Xian (xr843)
https://github.com/xr843/Buddhist-AI-Translator · https://fojin.ai

---

## 与上一版的差别，以及为什么

| 上一版 | 现在 | 原因 |
|---|---|---|
| 第 3 条：「我们想建自己的平行索引，可以吗？」 | **删掉** | 计划已作废——改走 fojin 的 `get_parallels`，不碰数据本身 |
| 附了覆盖率实测数字（1,208 部经等） | **删掉** | 那是自建索引方案的论据，现在不需要 |
| 「if the licence allows」的请求口吻 | 改为「你们指针坏了，告知一声」 | 我们不再需要许可来做那件事 |
| 只提慧译通 | **同时表明 fojin 身份** | fojin 才是真正摄入这份语料的一方，隐去反而不实 |
| 署名 `[署名]` 占位 | 填上真实署名与两个项目链接 | — |

## 已定

- **署名**：`Ren Xian (xr843)` + 两个项目链接
- **表明 fojin 身份**：是。理由是诚实，且 v2 许可问题本来就与 fojin 直接相关
- **邮箱**：用 gmail 那个地址发，但**不写进仓库**（公开历史撤不干净；From 已经是它了）
- **CORS 判据**：2026-08-15 实测复现过，两个端点 ACAO 均为 2、预检为 1，报告准确

发之前若想自己再复跑一遍 CORS，命令就在信里，`grep -ci` 返回 2 即复现。

## 发出后

回复要点请记回 `NOTICE.md` 第四节——那里现在把 v2 标着 `UNVERIFIED`，
对方一旦确认，这个标记要据此更新或撤销，否则仓库里会留一条过时的合规声明。
