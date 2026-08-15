<div align="center">

# 慧译通 | Buddhist AI Translator

**专业佛教文献 AI 翻译平台 | Professional Buddhist Text AI Translation Platform**

[![GitHub Stars](https://img.shields.io/github/stars/xr843/Buddhist-AI-Translator?style=for-the-badge&logo=github&color=gold)](https://github.com/xr843/Buddhist-AI-Translator/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/xr843/Buddhist-AI-Translator?style=for-the-badge&logo=github)](https://github.com/xr843/Buddhist-AI-Translator/network/members)
[![License](https://img.shields.io/github/license/xr843/Buddhist-AI-Translator?style=for-the-badge)](LICENSE)
[![Live Demo](https://img.shields.io/badge/LIVE-DEMO-brightgreen?style=for-the-badge&logo=firefox)](https://xr843.github.io/Buddhist-AI-Translator/)

[English](#english) | [中文](#中文)

<img src="image/README/1749601583838.png" alt="Buddhist AI Translator Interface" width="800"/>

</div>

---

<a name="中文"></a>

## 项目简介

慧译通是一款专为佛教文献翻译设计的 AI 翻译平台。默认使用佛典专用的 MITRA 神经翻译引擎
（Dharmamitra 项目，东北大学），**打开即用、无需任何密钥**；并以 8,610 条从平行语料挖掘的
实证术语对照为参考，为学者、修行者和佛学爱好者提供准确、可溯源的多语种翻译。

### 核心特性

| 特性 | 说明 |
|------|------|
| **佛典专用引擎** | 默认走 MITRA，梵／巴／汉／藏四种佛典语言无需密钥即可翻译 |
| **多本合参** | 同一段落的多语种写本一起送入，得到一份权衡各本的译文，可指定侧重写本 |
| **译风控制** | 文本类别 + 译法／术语呈现／语体／注释深度，五维组合成给模型的指令 |
| **出处溯源** | 一键在藏经语料中检索原文，返回经名、`segmentnr` 与阅读室深链 |
| **实证术语对照** | 8,610 条汉语术语 → 梵文原语／藏译，带出现次数与大正藏经号 |
| **18 种语言** | 梵文、巴利文、藏文、文言文、现代中文、英文等 |
| **语音功能** | 语音输入 + 多语言朗读，支持分段高亮 |
| **结果导出** | 一键下载译文、原文、引擎与译风信息为 `.txt` 文件 |
| **静态部署** | 纯前端 ES 模块，可用任意静态服务器运行 |

### 两个引擎的分工

| | MITRA（默认） | DeepSeek（可选） |
|---|---|---|
| 密钥 | 不需要 | 需要，或由 Worker 代管 |
| 擅长 | 佛典语言 → 现代语言 | MITRA 不受理的语种对 |
| 何时使用 | 源语言是文言文／梵／巴／藏，且目标是现代语言 | 译入文言文、译入古典语言、从现代语言译出 |

引擎在界面上可以手动指定，也可以交给「自动选择」。详见 [docs/mitra.md](docs/mitra.md)。

> ⚠️ **启用 MITRA 需要先部署 `worker/`（不需要任何密钥）。**
> 浏览器不能直连 Dharmamitra —— 对方在实际响应上重复发送
> `Access-Control-Allow-Origin`，浏览器一律拒收（curl 看不出来，只有真浏览器照得出）。
> 部署后在 `src/config.js` 填 `proxyURL`，或在站点的「配置API」弹窗里填自己的
> Worker 地址即可。未配置中转时，站点自动退回 DeepSeek。

### 支持语言

- **古典语言**: 梵文 (Devanagari/Harvard-Kyoto)、巴利文、藏文、文言文
- **现代语言**: 中文、英文、日文、韩文、法文、德文、西班牙文、葡萄牙文、意大利文、荷兰文、俄文、阿拉伯文

### 快速开始

**在线使用**: [https://xr843.github.io/Buddhist-AI-Translator/](https://xr843.github.io/Buddhist-AI-Translator/)

**本地部署**:
```bash
git clone https://github.com/xr843/Buddhist-AI-Translator.git
cd Buddhist-AI-Translator
python3 -m http.server 8000
# 访问 http://127.0.0.1:8000/
```

**配置**:

1. **启用 MITRA（推荐，无需任何密钥）**: 部署 `worker/`，在 `src/config.js` 填 `proxyURL`
   —— 或直接在站点的「配置API」弹窗里填 Worker 地址。之后所有访客都能用佛典引擎与藏经溯源，
   谁都不用自备密钥。
   ```bash
   cd worker && wrangler deploy      # 这一步不需要 wrangler secret put
   ```
2. **DeepSeek（可选）**: 只有 MITRA 不受理的语种对才需要。BYOK 模式在浏览器本地保存密钥；
   公共部署应把密钥交给同一个 Worker 代管（`wrangler secret put DEEPSEEK_API_KEY`），
   避免在浏览器暴露共享密钥。

详见 [worker/README.md](worker/README.md)。

**本地验证**:
```bash
npm install
npx playwright install chromium
npm run verify
```
需要 Node.js 22 或更高版本。`npm run verify` 会执行语法检查、Worker dry-run、术语校验、真实浏览器 smoke 测试和 Node 测试。

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Enter` | 执行翻译 |
| `Ctrl + Shift + C` | 复制翻译结果 |
| `Ctrl + Shift + V` | 粘贴文本 |
| `Ctrl + Shift + X` | 清空输入 |

### 技术栈

```
Frontend:      HTML5 + CSS3 + JavaScript ES6+（无框架、无构建）
翻译引擎:      MITRA cat-translate（默认，免密钥）/ DeepSeek API（可选）
语料检索:      MITRA primary search
术语数据:      dharmamitra-lexicon (CC BY 4.0)
Icons:         内联 SVG sprite（自绘，无第三方图标集依赖）
Fonts:         Google Fonts (Noto Sans SC/Serif SC)
Speech:        Web Speech API
```

### 佛教术语数据库

分两层。

**人工审定层** `src/terms.json`（55 条，带解释，随首屏加载）:
- **心经术语**: 般若波罗蜜多、观自在菩萨、五蕴皆空...
- **基础概念**: 三宝、四谛、八正道、无常、无我、涅槃...
- **唯识学派**: 阿赖耶识、八识、三性...
- **中观学派**: 中道、空性、缘起、二谛...
- **净土/禅宗**: 阿弥陀佛、念佛、顿悟、明心见性...

**实证对照层** `src/data/lexicon.json`（8,610 条，按需加载）:
从 [dharmamitra-lexicon](https://github.com/dharmamitra/dharmamitra-lexicon)（CC BY 4.0）
挖掘的汉语术语 → 梵文原语／藏译，每条带出现次数与大正藏经号。例如

| 术语 | 梵文原语（出现次数） | 藏译 |
|---|---|---|
| 涅槃 | nirvāṇa (611) / parinirvāṇa (40) | mya ngan las 'das pa |
| 阿賴耶識 | ālayavijñāna (45) | kun gzhi rnam par shes pa |
| 空 | śūnyatā (644) / śūnya (630) / **ākāśa (232)** | stong pa nyid |

（「空」同时对应 śūnyatā 与 ākāśa，正是手写术语表容易漏掉的一类分歧。）

这一层是机器挖掘、未经逐条审定的。构建方法、过滤依据与**抽样实测精确率 87.5%**
见 [docs/lexicon.md](docs/lexicon.md)。

---

<a name="english"></a>

## English

### About

Buddhist AI Translator is a specialized translation platform for Buddhist texts. It runs on the
domain-tuned **MITRA** neural translation engine (Dharmamitra project, Tohoku University) by
default — **no API key required** — and grounds its output in 8,610 attested term correspondences
mined from aligned canonical parallels.

### Key Features

| Feature | Description |
|---------|-------------|
| **Domain engine, no key** | MITRA translates Sanskrit, Pali, Classical Chinese and Tibetan out of the box |
| **Multi-witness translation** | Feed several language witnesses of one passage; get a single synthesised translation, optionally weighted toward a base text |
| **Style control** | Source category plus literalness / term rendering / register / gloss depth, compiled into the model instruction |
| **Provenance lookup** | Search the canonical corpus for the source passage; get titles, segment IDs and reading-room deep links |
| **Attested glossary** | 8,610 Chinese terms mapped to their Sanskrit originals and Tibetan renderings, with occurrence counts and Taishō numbers |
| **18 Languages** | Sanskrit, Pali, Tibetan, Classical Chinese, Modern Chinese, English, etc. |
| **Voice Support** | Speech input + multi-language text-to-speech with segment highlighting |
| **Result Export** | Download source, translation, engine and style metadata as a `.txt` file |
| **Static Deployment** | Frontend ES modules that run from any static server |

### Supported Languages

- **Classical**: Sanskrit (Devanagari/Harvard-Kyoto), Pali, Tibetan, Classical Chinese
- **Modern**: Chinese, English, Japanese, Korean, French, German, Spanish, Portuguese, Italian, Dutch, Russian, Arabic

### Quick Start

**Online Demo**: [https://xr843.github.io/Buddhist-AI-Translator/](https://xr843.github.io/Buddhist-AI-Translator/)

**Local Deployment**:
```bash
git clone https://github.com/xr843/Buddhist-AI-Translator.git
cd Buddhist-AI-Translator
python3 -m http.server 8000
# Visit http://127.0.0.1:8000/
```

**Configuration**:

1. **Enable MITRA (recommended, no key of any kind)**: deploy `worker/` and set `proxyURL` in
   `src/config.js`, or paste the Worker URL into the site's settings dialog. Browsers cannot call
   Dharmamitra directly — it sends a duplicated `Access-Control-Allow-Origin` on real responses,
   which every browser rejects (curl does not check this; only a real browser catches it).
   ```bash
   cd worker && wrangler deploy      # no `wrangler secret put` needed for MITRA
   ```
2. **DeepSeek (optional)**: only for pairs MITRA does not serve. BYOK mode stores the key in the
   browser; public deployments should let the same Worker hold the key
   (`wrangler secret put DEEPSEEK_API_KEY`) so shared keys stay server-side.

See [worker/README.md](worker/README.md).

**Local Verification**:
```bash
npm install
npx playwright install chromium
npm run verify
```
Requires Node.js 22 or newer. `npm run verify` runs syntax checks, the Worker dry-run, terms validation, a real browser smoke check, and Node tests.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Enter` | Translate |
| `Ctrl + Shift + C` | Copy result |
| `Ctrl + Shift + V` | Paste text |
| `Ctrl + Shift + X` | Clear input |

---

## Project Structure

```
Buddhist-AI-Translator/
├── index.html          # Main page
├── styles/             # Three-layer stylesheet
│   ├── tokens.css      # Design tokens, light + dark. The only file allowed raw hex
│   ├── base.css        # Reset, typography, form/button/icon/modal primitives
│   └── components.css  # Feature blocks + responsive rules
├── src/                # ES modules: translator, mitra client, style, lexicon, config, terms
│   └── data/           # Generated lexicon index (CC BY 4.0, see docs/lexicon.md)
├── worker/             # Optional Cloudflare Worker proxy
├── scripts/            # Verification scripts + the lexicon build tool
├── docs/               # MITRA integration and lexicon provenance notes
├── tests/              # Node source and unit tests
├── README.md           # Documentation
├── CONTRIBUTING.md     # Contribution guidelines
├── LICENSE             # MIT License
└── image/              # Screenshots
```

## 数据来源与鸣谢 | Attribution

完整声明见 **[NOTICE.md](NOTICE.md)**（含每条许可声明的可复核出处、改编详情、以及义务与请求的区分）。

本项目的佛典翻译能力、语料检索与术语对照数据来自
**[Dharmamitra](https://dharmamitra.org) / MITRA 项目（东北大学，Sebastian Nehrdich 等）**：

| 用途 | 来源 | 许可 | 声明出处 |
|---|---|---|---|
| 佛典翻译（默认引擎） | MITRA `cat-translate` 公开接口 | ⚠️ 未找到使用条款（八个常见路径均 404，非对方确认不存在）；官方文档自述 “free-for-access” | [MITRA Translate 文档](https://dharmamitra.github.io/dharmamitra-guides/mitra_tools/translate/) |
| 藏经语料检索与深链 | MITRA `primary` 公开接口 | 同上 | 同上 |
| 汉语术语 → 梵／藏对照 | [dharmamitra-lexicon](https://github.com/dharmamitra/dharmamitra-lexicon) | **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**，**本项目已改编** | 上游 README `## License` 一节（⚠️ 该仓库无 LICENSE 文件） |

术语对照数据是**派生品而非原样转发**：只取两个方向、按词聚合、两道过滤、每词只留前几个原语，
8,610 条约为上游 684,365 组对照的一小部分。改动清单见 [NOTICE.md](NOTICE.md) 与 [docs/lexicon.md](docs/lexicon.md)。

产品形态上的**译风多维控制**（文本类别 + 若干风格维度组合成给模型的指令），
参考了 [foguang.ai](https://foguang.ai)（佛光山人间佛教研究院 × MITRA）公开说明的做法。

> **公开部署前致信 `dharmamitra-project@gmail.com` 告知。**
> 说明：这是上游 README 在许可条款**之外**提出的**请求**，不是 CC BY 4.0 的许可条件——
> 署名义务已由页脚与本节履行。本项目选择照办是出于礼节。两者不要混为一谈，
> 详见 [NOTICE.md](NOTICE.md) 第三节。

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | Full Support |
| Firefox | 85+ | Full Support |
| Safari | 14+ | Full Support |
| Edge | 90+ | Full Support |

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Add Buddhist terminology translations
- Improve UI/UX
- Add language support
- Fix bugs and issues
- Improve documentation

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

Translation results are for reference and learning purposes. For important Buddhist scholarly research, please:
- Consult professional Buddhist scholars
- Cross-reference authoritative texts
- Consider cultural and historical context

---

<div align="center">

**愿以此功德，普及于一切。我等与众生，皆共成佛道。**

*May this merit extend universally to all, so that we and all sentient beings together may attain Buddhahood.*

[![Star History Chart](https://api.star-history.com/svg?repos=xr843/Buddhist-AI-Translator&type=Date)](https://star-history.com/#xr843/Buddhist-AI-Translator&Date)

---

Made with &#9825; for Buddhist Studies

</div>
