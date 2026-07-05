<div align="center">

# 慧译通 | Buddhist AI Translator

**专业佛教文献 AI 翻译平台 | Professional Buddhist Text AI Translation Platform**

[![GitHub Stars](https://img.shields.io/github/stars/xr843/Buddhist-AI-Translator?style=for-the-badge&logo=github&color=gold)](https://github.com/xr843/Buddhist-AI-Translator/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/xr843/Buddhist-AI-Translator?style=for-the-badge&logo=github)](https://github.com/xr843/Buddhist-AI-Translator/network/members)
[![License](https://img.shields.io/github/license/xr843/Buddhist-AI-Translator?style=for-the-badge)](LICENSE)
[![Live Demo](https://img.shields.io/badge/LIVE-DEMO-brightgreen?style=for-the-badge&logo=firefox)](https://xr843.github.io/Buddhist-AI-Translator)

[English](#english) | [中文](#中文)

<img src="image/README/1749601583838.png" alt="Buddhist AI Translator Interface" width="800"/>

</div>

---

<a name="中文"></a>

## 项目简介

慧译通是一款专为佛教文献翻译设计的 AI 翻译平台。结合 DeepSeek 大语言模型与专业佛学术语库，为学者、修行者和佛学爱好者提供准确、专业的多语种翻译服务。

### 核心特性

| 特性 | 说明 |
|------|------|
| **AI 智能翻译** | DeepSeek API 驱动，深度理解佛学语境 |
| **18 种语言** | 梵文、巴利文、藏文、文言文、现代中文、英文等 |
| **50+ 术语库** | 内置专业佛教术语数据库，确保翻译准确性 |
| **语音功能** | 语音输入 + 多语言朗读，支持分段高亮 |
| **静态部署** | 纯前端 ES 模块，可用任意静态服务器运行 |

### 支持语言

- **古典语言**: 梵文 (Devanagari/Harvard-Kyoto)、巴利文、藏文、文言文
- **现代语言**: 中文、英文、日文、韩文、法文、德文、西班牙文、葡萄牙文、意大利文、荷兰文、俄文、阿拉伯文

### 快速开始

**在线使用**: [https://xr843.github.io/Buddhist-AI-Translator](https://xr843.github.io/Buddhist-AI-Translator)

**本地部署**:
```bash
git clone https://github.com/xr843/Buddhist-AI-Translator.git
cd Buddhist-AI-Translator
python3 -m http.server 8000
# 访问 http://127.0.0.1:8000/
```

**配置 API**:
1. BYOK 模式: 访问 [DeepSeek 开放平台](https://platform.deepseek.com) 获取 API 密钥，在浏览器中本地保存
2. Worker 代理模式: 部署 `worker/`，在 `src/config.js` 配置 `proxyURL`
3. 公共部署建议使用 Worker 代理，避免在浏览器暴露共享密钥

**本地验证**:
```bash
npm run verify
```
需要 Node.js 22 或更高版本。

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Enter` | 执行翻译 |
| `Ctrl + Shift + C` | 复制翻译结果 |
| `Ctrl + Shift + V` | 粘贴文本 |
| `Ctrl + Shift + X` | 清空输入 |

### 技术栈

```
Frontend: HTML5 + CSS3 + JavaScript ES6+
AI Engine: DeepSeek API
Icons: Font Awesome 6.0
Fonts: Google Fonts (Noto Sans SC/Serif SC)
Speech: Web Speech API
```

### 佛教术语数据库

内置经典术语翻译对照，涵盖:
- **心经术语**: 般若波罗蜜多、观自在菩萨、五蕴皆空...
- **基础概念**: 三宝、四谛、八正道、无常、无我、涅槃...
- **唯识学派**: 阿赖耶识、八识、三性...
- **中观学派**: 中道、空性、缘起、二谛...
- **净土/禅宗**: 阿弥陀佛、念佛、顿悟、明心见性...

---

<a name="english"></a>

## English

### About

Buddhist AI Translator is a specialized AI-powered translation platform designed for Buddhist texts. Combining DeepSeek's large language model with a professional Buddhist terminology database, it provides accurate, scholarly translations across 18 languages.

### Key Features

| Feature | Description |
|---------|-------------|
| **AI Translation** | Powered by DeepSeek API with deep Buddhist context understanding |
| **18 Languages** | Sanskrit, Pali, Tibetan, Classical Chinese, Modern Chinese, English, etc. |
| **50+ Terms** | Built-in professional Buddhist terminology database |
| **Voice Support** | Speech input + multi-language text-to-speech with segment highlighting |
| **Static Deployment** | Frontend ES modules that run from any static server |

### Supported Languages

- **Classical**: Sanskrit (Devanagari/Harvard-Kyoto), Pali, Tibetan, Classical Chinese
- **Modern**: Chinese, English, Japanese, Korean, French, German, Spanish, Portuguese, Italian, Dutch, Russian, Arabic

### Quick Start

**Online Demo**: [https://xr843.github.io/Buddhist-AI-Translator](https://xr843.github.io/Buddhist-AI-Translator)

**Local Deployment**:
```bash
git clone https://github.com/xr843/Buddhist-AI-Translator.git
cd Buddhist-AI-Translator
python3 -m http.server 8000
# Visit http://127.0.0.1:8000/
```

**API Configuration**:
1. BYOK mode: get an API key from [DeepSeek Platform](https://platform.deepseek.com) and save it locally in the browser
2. Worker proxy mode: deploy `worker/` and set `proxyURL` in `src/config.js`
3. Use the Worker proxy for public deployments so shared keys stay server-side

**Local Verification**:
```bash
npm run verify
```
Requires Node.js 22 or newer.

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
├── styles.css          # Stylesheet
├── src/                # ES modules, translator logic, config, terms
├── worker/             # Optional Cloudflare Worker proxy
├── tests/              # Node source and unit tests
├── script.js           # Legacy bundled script kept for reference
├── README.md           # Documentation
├── CONTRIBUTING.md     # Contribution guidelines
├── LICENSE             # MIT License
└── image/              # Screenshots
```

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
