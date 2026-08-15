# 整部经翻译的验收

回答一个问题：**把已译上文回喂给下一块，到底有没有真的压住术语漂移？**

看一眼译文觉得"还行"不算回答。这里做的是对照实验：同一部经、同一引擎、同一译风、
同一切块、同一术语表，**只改「回喂已译上文」这一个变量**，跑两遍，比同一套指标。

## 语料

`corpus/佛遺教經.zh.txt` —— 《佛遺教經》（全名《佛垂般涅槃略說教誡經》，
大正藏 T12n0389，後秦鳩摩羅什譯），126 句 / 2,879 字，一句一行，保留原有分段。

**核对记录在 `corpus/佛遺教經.meta.json` 的 `verification` 字段**：取首句、次句、末句
三处独特句，送 Dharmamitra 语料检索接口反查；末句直接命中 `ZH_T12_0389` 正文，
首次两句命中《遺教經論》《遺教經補註》等本经注疏。判定为完整正文，未见注疏混入。

⚠️ 做这类核对必须挑**独特句**。抽到「所以者何？」这种四字套语时反查 0 命中，
那是取样问题不是数据问题。

选它的理由：2,879 字切成 29 块，长到足够暴露漂移，又不至于跑一次要半小时。

## 术语清单

`corpus/佛遺教經.terms.json` —— 23 个全文出现 ≥3 次的实词/专名，带出现次数与行号。
排除了虚词与嵌套子串（「忘念」是「不忘念」的子串，只留后者）。

## 跑批

```bash
# A 组：回喂上文
NODE_USE_ENV_PROXY=1 node eval/run-document.mjs \
  --corpus eval/corpus/佛遺教經.zh.txt --out eval/out --target english

# B 组：不回喂，其余一模一样
NODE_USE_ENV_PROXY=1 node eval/run-document.mjs \
  --corpus eval/corpus/佛遺教經.zh.txt --out eval/out --target english --no-context
```

产物：`out/<经名>.<label>.md`（原文译文对照）与 `out/<经名>.<label>.contexts.json`
（每块实际送出去的 context，用来复核「回喂」这件事到底发生了没有）。

**目标语言用英文**，因为漂移在英文里看得见：比丘 → bhikṣu / monk / mendicant 一目了然；
译成现代汉语时「比丘」多半原样保留，反而测不出东西。

### ⚠️ 两个必须知道的坑

- **Node 的 fetch 默认不读 `http_proxy`/`https_proxy`**，curl 读。在走代理的机器上
  会出现「curl 通、脚本报 fetch failed」。加 `NODE_USE_ENV_PROXY=1`。
- **上游有限流**。实测 2026-08-15：约 10 次请求后开始回 429，**不带 `Retry-After`**，
  约 80 秒恢复。脚本按 6.5 秒一次（~9 次/分钟）走，撞上 429 则 30 秒起步递增退避。
  29 块一遍约 3.5 分钟。**别把间隔调小去抢时间**，那是别人的免费接口。

## 判读

```bash
node eval/drift-check.mjs --terms eval/corpus/佛遺教經.terms.json \
  --a eval/out/佛遺教經.with-context.md --b eval/out/佛遺教經.no-context.md
```

### 脚本做什么、不做什么

对每个术语，找出**原文含该术语的所有块**，统计这些块的译文里各个词的覆盖率
（出现在几分之几的块里）。覆盖率 1.0 意味着某个词在每一处都出现。

**脚本不知道「比丘」对应哪个英文词，也不宣布漂移率。** 它只摆出候选与数字。
覆盖率低于 1.0 可能是漂移，也可能是该术语这次被意译进句子里了——**必须人工看译文**。

因此报告里标 ⚠️ 的每一条都要逐条判读。判读标准：

- **算漂移**：同一术语在不同块被译成语义不同或形态不同的词
  （bhikṣu / monk / mendicant；nirvāṇa / extinction / cessation）。
- **不算漂移**：单复数、大小写、随句法调整的词形；
  术语被合理地融进句子而没有单独译出；同一个词加不加冠词。

### 为什么必须有 A/B 两组

单看一份译文的覆盖率没有基准——不知道 0.8 算好还是算差。
只有两组同条件对照，差值才有意义。

## 脚本自身的验证

`fixtures/` 下有两份**已知答案**的假译文，四块里「比丘」分别是：

- `consistent.md` —— 四处全作 `bhikṣus`
- `drifting.md` —— 四处分别作 `bhikṣus` / `monks` / `mendicants` / `almsmen`

实测输出：一致组 覆盖率 1.000（1/1 术语达标），漂移组 0.000（0/1），
并列出四个各占 0.25 的候选。**脚本对已知坏数据会报警**，不是摆设。

```bash
node eval/drift-check.mjs --terms eval/fixtures/terms.json \
  --a eval/fixtures/consistent.md --b eval/fixtures/drifting.md
```
