# 与 foguang.ai 的对照基线（2026-08-15）

这份记录的用途，是让「我们比谁强/弱」这句话有据可查。**它不是测量**——只有 4 段样本，
而且两边译风设置未对齐。你在标点项目上做 gj.cool 头对头时，前两版结论都因评测集问题
而错，第三次干净评测才拿到真实数字。这里同样只够回答「值不值得继续投入」。

## 最要紧的一条：双方跑在同一个引擎上

四条独立证据：

1. foguang.ai 页脚原文：`© Fo Guang Shan 2026 · powered by **MITRA** · v. 2.33 (2026.07.06)`
2. 其前端产物（8 个 chunk，628KB）**零处 `dharmamitra` 直连**，全部走自家 `/api/*`：
   `/api/translate`、`/api/explain-ai`、`/api/furigana`、`/api/glossary/personal`、
   `/api/parse-doc`、`/api/tts`、`/api/quota`、`/api/users/me`、`/api/auth/register`
3. 其 v2.32 更新日志写着：翻译服务限流触发时「自动暂停、显示倒计时、再续跑」——
   **撞的是与我们同一个上游限流**（约 10 次/分钟、不带 `Retry-After`）。说明它也是消费方，
   不是私有部署
4. 单次 500 字符上限，与 MITRA 的约束同量级

**推论：翻译质量的差异只可能来自送进引擎的输入**（`context` 与 `style_instruction`），
不可能来自模型。

## 能力面对比

| | foguang.ai v2.33 | 慧译通 |
|---|---|---|
| 引擎 | MITRA | 同一个 |
| 源语言 | **仅中文** | 18 种（含梵/巴/藏） |
| 目标语言 | 10 种 | 17 种 |
| 多本合参 | 无 | 有（但见下方「摆设」一节） |
| 译风 | 5 个维度（Literal/Fluent、Technical/Explanatory、Sanskrit/Pinyin、Formal/Contemporary、Generic/FGS） | 5 个维度 |
| 术语 | 官方术语表 + 用户众包个人表，命中词在原文里下划线高亮 | 8,610 条语料实证对照（带出现次数与大正藏经号），注入 `context` |
| 门槛 | 需账号；匿名 10 次/天 | 无需账号，不限次 |
| 长文 | Editor，流式输出 + 限流自动续跑 | 整部经模式 |
| 周边 | 文档解析 / TTS / 振假名 / 译文讲解 / 思维导图 / 测验 / 历史 | 藏经溯源（代码在，界面已撤） |

**产品完成度上对方明显领先。**

## 4 段盲测的结果

选段取自《雜阿含經》T02n0099 与《瑜伽師地論》T30n1579 的中后段，
刻意避开「色不異空」「應無所住」这类双方都可能背下来的名句。中文→英文。

12 处可核对的术语差异：**我方占优 6、对方占优 4、打平 2。**

我方赢的**全部**落在术语精确度，且有几处是对方硬伤：

| 原文 | 慧译通 | foguang.ai |
|---|---|---|
| 等持 | concentrations (samādhi) | **equanimity** (samādhi) —— equanimity 是「捨」upekṣā；英文给错、梵文给对，自相矛盾 |
| 福德資糧 | accumulations of merit (puṇya) | the provisions of **Fortune and Virtue** —— 把一个词拆成两样 |
| 界差別 | the elements (dhātu-vibhāga) | the differentiation of **realms** |
| 作意 | mental engagement (manaskāra) | contemplation —— 那是「觀」 |
| 婆蹉 | **Vacchagotta** | Vatsa —— 音写正确但丢了人物；本经对应 SN 44.9 |

对方赢的**全部**落在行文保真：引号层次、`長夜` 固定语、`二業` 数目结构。
我方另有一处自伤：`究竟出離` → ultimate liberation (**niṣṭhā**)，括注挂错了词。

**这个分布是有意义的**：术语靠数据，行文靠提示词。前者对方补起来贵，后者我们补起来便宜。

## 据此做的改动

`src/style.js` 新增 `fidelityRules()` —— 四条**与译风无关**的保真规则，恒定拼进
`style_instruction`（MITRA 路）与 DeepSeek prompt，不做成可开关的维度。
`tests/style.test.mjs` 有门禁钉着它们在任何译风组合下都在场。

同日实测复验（直接对 Worker 打新指令，对比改动前的译文）：

| 规则 | 验证结果 |
|---|---|
| 引号层次与人称 | ✅ 段① 末句从引号外移回引号内，`you should` 改回 `I must` |
| 佛典固定语 | ✅ 段① `長夜` 从 for a long time 改为 **a long night** |
| 数目结构 | ✅ 段④ `二業` 从省略数字改为 **two types** of physical and verbal actions |
| 括注挂位 | ⚠️ **未复验**（该失分出自段③，本轮未重跑） |

## ⚠️「多本合参」目前是摆设

它本该是对方架构上做不到的优势（其源语言仅中文）。但实测：
`/mitra/search` 带 `filter_target_language: "all"`，两种 `search_type` 都试过，
连心经这种**必然有梵藏本**的文本也是 **12/12 全部返回汉文**，
拿不到跨语平行段。

**也就是说用户必须自己粘贴梵文与藏文，这在真实使用中几乎不会发生。**
要让它变成真优势，得补上自动平行本检索（见下）。

## 下一步的候选，以及卡在哪

自动平行本检索的数据源是 `dharmamitra/mitra-parallel` v2：
`zh-sa_matches.ndjson.gz`（31MB）与 `zh-bo_matches.ndjson.gz`（80MB），
共 169 万条对齐记录 / 233 万段对，**段级对齐**，粒度够用。

⚠️ **但 v2 的许可状态是 `UNVERIFIED`**，引入前必须先解决——依据与范围限定见
`NOTICE.md` 第四节。别拿 v1 的 CC BY-SA 声明替 v2 背书。
