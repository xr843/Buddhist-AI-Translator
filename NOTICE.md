# 第三方数据与服务声明

本项目自身的代码依 MIT 协议发布（见 `LICENSE`）。下面列出随本仓库**再分发**的第三方数据，
以及运行时调用的第三方服务。每条都标出该许可声明的**可复核来源**——
不是转述，是权利方自己写的那一句在哪。

---

## 一、随仓库分发的数据

### `src/data/lexicon.json` —— 汉语佛典术语实证对照索引

| | |
|---|---|
| 上游 | [dharmamitra/dharmamitra-lexicon](https://github.com/dharmamitra/dharmamitra-lexicon) |
| 固定于提交 | `2b327f3453fb1d273ed00f367aac1c83a5c962b1` |
| 许可 | **CC BY 4.0** — 全文见 <https://creativecommons.org/licenses/by/4.0/> |
| 许可声明的出处 | 上游仓库 **README.md 的 `## License` 一节**，原话：<br>“This data is released under CC BY 4.0. You are free to share and adapt it as long as you give appropriate credit.” |
| ⚠️ 该仓库**没有** `LICENSE` 文件 | 2026-08-15 查：仓库根目录无 `LICENSE`/`COPYING`/`NOTICE`，GitHub 许可检测返回 `null`。许可依据仅为上述 README 声明。 |
| 署名对象 | Dharmamitra project（MITRA, Tohoku University） |
| **是否改编** | **是，改编幅度很大**（见下） |

**改编说明**（CC BY 4.0 §3(a)(1)(B) 要求指明是否修改）：

本项目分发的不是上游数据本身，而是从中派生的一份索引。所做的改动：

1. 只取上游 `sa-zh/` 与 `zh-bo/` 两个目录，丢弃 `sa-bo/`；
2. 把「每条一次真实出现」的记录**按词聚合**成「每词一条」，附出现次数与大正藏经号；
3. 过滤：要求有梵文原语，且首选梵文原语占该词梵语侧出现总数 ≥25%；
4. 每词只保留出现次数最高的 4 个梵文原语与 2 个藏译，其余丢弃；
5. 单字词除少量人工确认的术语外一律排除。

结果为 8,610 条，约为上游 684,365 组对照中的一小部分。构建脚本与依据见
[`scripts/build-lexicon.mjs`](scripts/build-lexicon.mjs) 与 [`docs/lexicon.md`](docs/lexicon.md)。

**已履行的署名义务**（CC BY 4.0 §3(a)(1)）：

| 条款 | 落在哪里 |
|---|---|
| (A)(i) 署名创作者 | 站点页脚、README、`lexicon.json` 的 `meta.attribution` |
| (A)(v) 指向被许可素材的链接 | 站点页脚、README、`meta.upstream` 均链到上游仓库 |
| (B) 指明已修改 | 站点页脚写明「经筛选改编」，本文件与 `docs/lexicon.md` 列出全部改动 |
| (C) 指明许可并给出许可全文链接 | 站点页脚、README、`meta.licenseUrl` 均链到 CC BY 4.0 全文 |

(A)(ii) 版权声明与 (A)(iv) 免责声明：上游未提供，故无可保留者
（§3(a)(1)(A) 的措辞是 “retain the following **if it is supplied by the Licensor**”）。

---

## 二、运行时调用的服务

### Dharmamitra 公开接口

`POST https://dharmamitra.org/api-search/cat-translate/v1/translate`（佛典翻译）
`POST https://dharmamitra.org/api-search/primary/`（藏经语料检索）

| | |
|---|---|
| 鉴权 | 无需 |
| 使用条款 | ⚠️ **未找到**。2026-08-15 查了 `/terms`、`/terms-of-use`、`/tos`、`/legal`、`/licensing`、`/privacy`、`/about`、`/api` 八个路径，均返回 404。**这只说明在这些路径上没找到，不等于对方确认不存在。** |
| 权利方就用量的唯一表述 | 官方文档 [MITRA Translate](https://dharmamitra.github.io/dharmamitra-guides/mitra_tools/translate/)：“We offer **free-for-access** machine translation capabilities”。这是一句可获取性的陈述，**不是一份许可**。 |
| 译文的著作权归属 | 未见任何一方作出声明。**未核实。** |

本项目为减少无谓请求所做的事：按（原文＋语种对＋译风＋引擎）缓存、失败不自动重试、
整部经模式每块间隔 6 秒并对 429 退避、术语索引加载失败不阻塞翻译。

若权利方希望限制或改变用法，请告知，本项目会照办。

---

## 三、义务与请求，分开记

**义务**（许可条件，必须满足且可被第三方核验）：

- CC BY 4.0 的署名、许可链接、改编声明——已履行，落点见上表。

**请求**（对方的偏好，接不接是选择，不是合规问题）：

- 上游 README 在许可条款之外另有一句：
  “If you use this data in a public facing downstream application, please acknowledge the
  Dharmamitra project, and we would appreciate hearing from you at
  dharmamitra-project@gmail.com, ideally before you launch.”
  其中「acknowledge」已被 CC BY 的署名义务覆盖；**「上线前来信告知」是请求，不是许可条件**。
  本项目选择照办，但这是出于礼节，不是合规要求——记录在此以免日后把两者混为一谈。

---

## 四、未使用、因而不受其条款约束的上游资源

- `dharmamitra/mitra-parallel`（**CC BY-SA 4.0**，相同方式共享）——本项目**未使用**，
  仓库内无任何引用（2026-08-15 全仓库检索命中 0）。特此记录，是因为 SA 条款会传染，
  若日后引入需重新评估本项目的分发条件。
- HuggingFace `buddhist-nlp` 组织下的模型——本项目未自托管、未再分发。

---

*最近核查：2026-08-15。核查方法与常见错误见 `docs/lexicon.md`。*
