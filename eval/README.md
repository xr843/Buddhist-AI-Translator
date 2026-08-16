# eval —— 验收与对照

⚠️ 这个目录此前**只存在于本地、从未提交**，而 `CLAUDE.md` 一直引用着它里面的
`drift-check.mjs` 与 `RESULTS.md`。也就是说文档描述了一套并不在仓库里的验收设施。
2026-08-15 重建，这次进 git。

## 这里的东西不下判断

脚本只出数据与差异，**结论一律人工看**。机器判佛典术语对错这件事本身就不可靠：
`等持` 该译 concentration 还是 equanimity，靠正则和 BLEU 都判不了。

## 方法上的三条硬规矩

**一、只改一个变量。** 两臂之间除了要测的那一项，译风、指令、写本、目标语种必须
完全一致。译风一旦不同，测出来的就不是你以为的那个东西。

**二、选段要有鉴别力，不能随机抽。** 2026-08-15 随机抽 4 段做的对照得出过
「术语库不改英文选词」的结论，但随机样本没有鉴别力——多数段落 MITRA 本来就译对了，
术语库无从体现。`select-passages.mjs` 挑的是术语库密集命中、且命中词本身对译分散的段落。

⚠️ 这个脚本第一版就栽过：`buildLexiconContext` 的 `maxTerms` 上限是 12，
导致「命中条数」在密集段落上全部顶格，4,140 段里 4,103 段都过了筛子，
选出来的 15 段分数一模一样。**打分饱和 = 没有筛选。** 加分前先确认它真能区分。

**三、评测集污染要当回事。** 挑段避开「色不異空」「應無所住而生其心」这类
双方模型都可能背下来的名句，取各经中后段，避开卷首套语。

## 一个已知的观测限制

上游是**确定性解码**：同一段、同一指令连跑三次，输出逐字节完全一致。

- 好处：前后差异可归因于变量改动，不是随机波动
- 坏处：**无法用重复采样估计方差**。样本量小时不要谈显著性

## 脚本

| 文件 | 作用 |
|---|---|
| `select-passages.mjs` | 从本地 CBETA P5 抽有鉴别力的段落 → `passages.json` |
| `lexicon-ab.mjs` | 术语库注入 vs 不注入的 A/B → `lexicon-ab.json` |

`select-passages.mjs` 需要本地 CBETA 全文，默认路径
`/home/lqsxi/projects/hanzhu-align/xml-p5`，可用 `CBETA_DIR` 覆盖。
那是另一个项目的**只读**资产，不随本仓库分发。

## 跑法

```bash
node eval/select-passages.mjs > eval/passages.json
NODE_USE_ENV_PROXY=1 node eval/lexicon-ab.mjs > eval/lexicon-ab.json
```

⚠️ **`NODE_USE_ENV_PROXY=1` 不能省**：Node 的 fetch 默认不读 `https_proxy`
（`curl` 读），在走代理的机器上会表现为「curl 通、脚本卡死」。

⚠️ 上游约 **10 次请求/分钟**就回 429 且不带 `Retry-After`，约 80 秒恢复。
脚本默认每次请求间隔 8 秒，**别往下调**——那是别人的免费接口。
