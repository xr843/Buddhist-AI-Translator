# 界面与配色重做：素雅经卷

日期：2026-08-15 · 分支：`feat/ui-redesign`

这份文档是**并行实施的契约**。四个 agent 各改各的文件，靠这里对齐 token 名、类名、
图标 id 与选择器归属。**凡本文写死的名字，一个字母都不要改**；确有必要改，回来先改这里。

## 1. 为什么改

| 问题 | 位置 | 后果 |
|---|---|---|
| 白字压 `#d4af37` 金底 | `.hero` | 对比度 **1.9:1**，AA 要 4.5:1 |
| 顶部导航是空的 | `index.html:53-58` | `.nav-menu` 无子元素，白占一条 sticky 横条 |
| 三处 `!important` 死高度 | `.translator-card` 580px、`.text-input/.text-output` 320px | 页面底部内容被裁掉 |
| 深色模式半成品 | `styles.css:618` 仅覆盖 5 个变量 | 金色横幅、`#f8f9fa` 渐变、消息条在深色下全破 |
| 层级平铺 | 四条同重量设置栏摞着 | 主任务没有视觉优先级 |

## 2. 定下的四个决定

1. **视觉方向**：素雅经卷——宣纸底 + 墨色正文，金色降为点缀（不做底色），朱砂作强调。
2. **范围**：配色 + 布局同改（删空导航、解死高度、设置栏重组）。
3. **深色模式**：补成完整的，跟随系统，无切换按钮。
4. **外部依赖**：Font Awesome 内联为自绘 SVG sprite；Google Fonts 保留。

## 3. 文件结构

删除 `styles.css`，拆为三份，`index.html` 里三个并列 `<link>`（顺序即层叠顺序）：

```
styles/tokens.css       设计变量，浅色 + 深色两套。唯一允许出现裸 hex 的文件
styles/base.css         reset / 排版 / 表单基元 / 按钮 / 图标 / 模态框 / 消息条
styles/components.css   各功能块 + 全部响应式断点
```

拆分的决定性理由：**「除 tokens.css 外禁止裸 hex」这道门禁在单文件里无法表达**
（token 定义本身就得写 hex）。拆开后它才是一道真闸门。

## 4. 设计 token（`styles/tokens.css`）

token 名是契约的一部分。base.css 与 components.css **只准引用下表里的名字**。

### 4.1 颜色 · 浅色（`:root`）

| token | 值 | 用途 |
|---|---|---|
| `--bg` | `#F5F1E8` | 页面底，偏暖的下沉色 |
| `--surface` | `#FBF9F4` | 卡片／面板，抬起的宣纸白 |
| `--surface-2` | `#EFEADE` | 内嵌块：多本合参栅格、modal-note、code |
| `--ink-0` | `#1F1B16` | 正文墨色 |
| `--ink-1` | `#4A4239` | 次级文字（标签、面板标题） |
| `--ink-2` | `#6B6259` | 弱化文字（提示、计数、meta） |
| `--line` | `#E3DCCC` | 常规描边 |
| `--line-strong` | `#CFC5AF` | 输入框描边、分隔线 |
| `--gold` | `#B8860B` | **仅图标／细边／分隔**，禁止用作正文色或大面积底色 |
| `--gold-soft` | `#EFE3C2` | 选中态的浅金底 |
| `--gold-text` | `#7A5A06` | 需要金色调的**文字**时用这个（`--gold` 对比度只有 3.1:1） |
| `--accent` | `#A63A2E` | 朱砂：主按钮、焦点环、强调 |
| `--accent-hover` | `#8E2F25` | 主按钮悬停 |
| `--accent-soft` | `#F6E9E6` | 朱砂浅底 |
| `--on-accent` | `#FFFFFF` | 压在 `--accent` 上的文字色 |
| `--ok` | `#2F6B4F` | 连接正常的状态点 |
| `--warn` | `#8A6D12` | 警告 |
| `--danger` | `#A63A2E` | 错误（与 accent 同色，语义不同） |
| `--footer-bg` | `#1F1B16` | 页脚墨底 |
| `--footer-ink` | `#D8D0C0` | 页脚文字 |
| `--footer-link` | `#E0C77A` | 页脚链接（对 `--footer-bg` 10.3:1） |

### 4.2 颜色 · 深色（`@media (prefers-color-scheme: dark)` 内重定义**同名** token）

| token | 值 |
|---|---|
| `--bg` | `#14120F` |
| `--surface` | `#1C1915` |
| `--surface-2` | `#26221C` |
| `--ink-0` | `#EDE7DA` |
| `--ink-1` | `#C9C0AE` |
| `--ink-2` | `#9A9184` |
| `--line` | `#332E26` |
| `--line-strong` | `#47402F` |
| `--gold` | `#D9AE4A` |
| `--gold-soft` | `#33291A` |
| `--gold-text` | `#E0C77A` |
| `--accent` | `#D9705F` |
| `--accent-hover` | `#E6897A` |
| `--accent-soft` | `#33201C` |
| `--on-accent` | `#14120F` |
| `--ok` | `#6FBF95` |
| `--warn` | `#D9AE4A` |
| `--danger` | `#E88B7C` |
| `--footer-bg` | `#0F0D0B` |
| `--footer-ink` | `#C9C0AE` |
| `--footer-link` | `#E0C77A` |

**两套 token 的键集合必须完全一致**，门禁会比对。

### 4.3 非颜色 token（不随主题变，只定义一次）

```
--space-1: 4px    --space-2: 8px    --space-3: 12px
--space-4: 16px   --space-5: 24px   --space-6: 32px

--radius-sm: 6px   --radius-md: 10px   --radius-lg: 14px   --radius-full: 999px

--font-sans:  'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', sans-serif
--font-serif: 'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', serif

--text-xs: .75rem   --text-sm: .85rem   --text-base: 1rem
--text-lg: 1.125rem --text-xl: 1.5rem   --text-2xl: 1.875rem

--leading-tight: 1.35   --leading-normal: 1.6   --leading-canon: 1.9

--transition: 180ms cubic-bezier(.2,.7,.3,1)
```

阴影随主题变，所以属于 4.1/4.2（两套都要给）：
`--shadow-1`、`--shadow-2`。浅色用暖调 `rgba(31,27,22,.06)` / `.10`；
深色改为更深的 `rgba(0,0,0,.4)` / `.55`。

### 4.4 排版决定

**佛典正文用衬线体**是这次排版升级的实质内容：`.text-input`、`.text-output`、
`.prov-text` 用 `var(--font-serif)` + `var(--leading-canon)`；界面文字（标签、按钮、
提示）保持 `var(--font-sans)`。`.hero-title` 用衬线。

## 5. 布局改动

### 5.1 顶栏：删空导航，换成真 app bar

删掉整个 `<header class="header">…</header>`（含 `.navbar`/`.nav-container`/`.nav-menu`/
`.nav-toggle`）。换成：

```html
<header class="app-bar">
  <div class="app-bar-inner">
    <span class="brand">慧译通 <span class="brand-sub">佛典 AI 翻译</span></span>
    <div class="app-bar-actions">
      <!-- 原 .api-status-bar 的内容整体搬到这里 -->
    </div>
  </div>
</header>
```

`.app-bar` 保持 `position: sticky; top: 0;`，底部 1px `var(--line)`，背景 `var(--surface)`。
**不要**做金色渐变。

### 5.2 hero：去掉金色横幅

`.hero` 不再有 `background: linear-gradient(...)`，改为透明（继承 `--bg`）、居中、上下
`var(--space-4)`。`.hero-title` 墨色衬线 `var(--text-2xl)`；`.hero-subtitle` 用 `--ink-2`、
`var(--text-sm)`。**h1 与副标题文案一字不改**（SEO 与 meta description 对应）。

### 5.3 设置区四条并三条

原来是 `.api-status-bar` / `.language-selectors` / `.style-panel` / `.witness-bar` 四条平铺。改为：

1. **app bar 内**：引擎选择 + 状态点 + 配置按钮（原 `.api-status-bar` 的全部子元素搬过去）
2. **`.language-selectors`**：源 ⇄ 目标，作为视觉锚点，保持 `1fr auto 1fr`
3. **`.settings-row`**（新增容器）：把 `<details id="style-panel">` 和 `.witness-bar` 并排放进
   一个 flex 行，窄屏回落为纵向堆叠

⚠️ **所有 id 必须原样保留**：`engine-select`、`api-status-text`、`api-status-indicator`、
`api-settings-btn`、`source-lang`、`target-lang`、`swap-btn`、`style-panel`、`style-summary`、
`style-grid`、`multi-witness-toggle`、`witness-grid`、`focus-select`、`source-text`、
`translation-result`、`result-meta`、`lexicon-panel`、`provenance-panel`、`clear-input`、
`voice-input`、`paste-btn`、`provenance-btn`、`copy-btn`、`download-btn`、`speaker-btn`、
`translate-btn`、`source-label`、`target-label`、以及模态框那一组。
`#style-panel` **必须仍是 `<details>`**（冒烟测试直接设它的 `.open`）。

### 5.4 解掉死高度

| 现在 | 改成 |
|---|---|
| `.translator-card { height: 580px !important; min-height: min(580px, calc(100vh - 140px)) !important }` | 去掉 `height`，保留 `min-height: min(560px, calc(100vh - 260px))`（**`min(` 不能去，有测试钉**） |
| `.text-input/.text-output { height/min-height/max-height: 320px !important }` | `height: clamp(220px, 38vh, 460px)`，`.text-input` 加 `resize: vertical` |
| 响应式断点里的 280px / 240px 死高度 | 一并删掉，clamp 已经覆盖 |

`.translator { padding-bottom: 72px }` **保留**（测试要求 ≥40px）。
`body { min-height: 100vh }` **保留**，且 body **不得**出现 `overflow: hidden`（测试钉了）。

### 5.5 不许动的东西

- `[hidden] { display: none !important }` —— CLAUDE.md 点名，删了 `.witness-grid` 藏不住
- `.lexicon-panel` / `.provenance-panel` 的 `grid-column: 1 / -1` —— 少了会被挤进中间 90px 窄列，
  冒烟测试实测渲染宽度
- 页脚 `.footer-credit` 类名、其中的 Dharmamitra / dharmamitra-lexicon / CC BY 4.0 链接 /
  「改编」/ NOTICE 全部文案与链接 —— `data-license.test.mjs:96` 从 `footer-credit` 切到
  `</footer>` 做匹配
- `<script type="application/ld+json">` 块 —— CSP 的 `sha256-DVs0fR8XB1jjl1bgTOlKWYtWCgzq/pEgxRTUXDRLz0U=`
  正是它的哈希（已实算核对）。**连空格都不要动**
- 两个语种下拉的 option **必须与 `src/languages.js` 的 `languageMap` 逐条一致**（有测试比对）

## 6. 图标：自绘 SVG sprite

### 6.1 为什么不抄 Font Awesome

FA Free 是 CC BY 4.0。抄它的 path 就是给本仓库再添一份署名义务，而这里有 8 条许可门禁
盯着署名落点。**不要从 FA、Feather、Lucide、Bootstrap Icons 或任何图标集复制 path。**
16 个都是简单几何形，用 `<path>`/`<line>`/`<circle>` 自己画。

### 6.2 sprite 形态

放在 `<body>` 开头：

```html
<svg class="icon-sprite" aria-hidden="true" focusable="false">
  <symbol id="i-key" viewBox="0 0 24 24">…</symbol>
  …
</svg>
```

`.icon-sprite { display: none }`（在 base.css）。引用处：

```html
<svg class="icon" aria-hidden="true"><use href="#i-key"></use></svg>
```

### 6.3 symbol id 清单（**契约，两个 agent 都按这个来**）

| id | 替换原来的 | 出现于 |
|---|---|---|
| `i-key` | `fa-key` | index.html, ui.js |
| `i-shield` | `fa-shield-alt` | ui.js |
| `i-check` | `fa-check-circle` | ui.js |
| `i-swap` | `fa-exchange-alt` | index.html |
| `i-sliders` | `fa-sliders-h` | index.html |
| `i-layers` | `fa-layer-group` | index.html |
| `i-close` | `fa-times` | index.html ×2 |
| `i-mic` | `fa-microphone` | index.html |
| `i-paste` | `fa-paste` | index.html |
| `i-book` | `fa-book-open` | index.html, ui.js ×4 |
| `i-copy` | `fa-copy` | index.html |
| `i-download` | `fa-download` | index.html |
| `i-volume` | `fa-volume-up` | index.html, ui.js |
| `i-stop` | `fa-stop` | ui.js |
| `i-language` | `fa-language` | index.html, ui.js ×2 |
| `i-spinner` | `fa-spinner fa-spin` | ui.js ×2 |

`fa-bars` 随空导航一起删除，不进 sprite。

`fa-spin` 的等价物：base.css 里 `.icon-spin { animation: spin 1s linear infinite }`
\+ `@keyframes spin`，并在 `prefers-reduced-motion: reduce` 下停掉。

### 6.4 CSP 与 head

- `<head>` 里删掉 `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/...font-awesome...">`
- CSP 的 `style-src` 删掉 `https://cdnjs.cloudflare.com`，`font-src` 删掉 `https://cdnjs.cloudflare.com`
- `style-src` 保留 `https://fonts.googleapis.com`，`font-src` 保留 `https://fonts.gstatic.com`
- 其余指令一字不动（`connect-src` 必须仍含 `https://api.deepseek.com`，有测试）

## 7. 选择器归属（防止两个 agent 撞车）

**base.css 拥有**：`*` reset、`[hidden]`、`body`、`.container`、`.main-content`、
`h1/h2/h3/p/a` 基础排版、`.sr-only`、`:focus-visible` 焦点环、
表单基元（`select`/`input`/`textarea`/`.form-control`/`.form-group`/`.form-text`）、
按钮基元（`.btn`/`.btn-primary`/`.btn-secondary`/`.tool-btn`/`.clear-btn`）、
`.icon`/`.icon-sprite`/`.icon-spin`/`@keyframes spin`、
`.message` 全族、`.modal` 全族（含 `.modal-note`/`.api-status`）、
`@media (prefers-reduced-motion)`、`@media (prefers-contrast: high)`。

**components.css 拥有**：`.app-bar` 全族、`.hero` 全族、`.translator`、`.translator-card`、
`.api-status-bar`/`.api-status-info`/`.status-indicator`/`.api-config-btn`/`.engine-label`/`.engine-select`、
`.language-selectors`/`.language-selector`/`.lang-select`/`.swap-languages`/`.swap-btn`、
`.settings-row`/`.style-*`、`.witness-*`、
`.translation-area`/`.input-section`/`.output-section`/`.text-area-header`/`.language-label`/
`.text-input`/`.text-output`/`.input-tools`/`.char-count`/`.translate-btn`/`.translate-button-container`/
`.output-tools`/`.translation-text`/`.placeholder`/`.error`、
`.result-meta`/`.lexicon-*`/`.provenance-*`/`.panel-*`/`.prov-*`、
`.speech-highlight` 全族、`.footer-simple`/`.footer-credit`、
以及**上述这些选择器的全部 `@media` 响应式规则**。

**已删除的 DOM，对应规则一并删掉**（别留死 CSS）：`.navbar`、`.nav-container`、`.nav-logo`、
`.logo`、`.logo-text`、`.nav-menu`、`.nav-link`、`.nav-toggle`、`.header`、
`.alternative-translations`、`.alternative-item`、`#alternatives`、`.confidence-score`。

## 8. 新门禁：`tests/design-tokens.test.mjs`

四条，全部必须做**变异测试**（把坏值放回去确认真的会红）：

1. **裸 hex 门禁**：`styles/base.css` 与 `styles/components.css` 中，
   剔除 `/* */` 注释后不得出现 `#[0-9a-fA-F]{3,8}` 字面量。
2. **两套 token 键集合一致**：解析 `tokens.css` 的 `:root` 块与 dark 块，
   两边 `--*` 名字集合相等（非颜色 token 只在 `:root` 定义，需从比对中排除，
   用一份显式的「仅浅色」白名单，不要用启发式）。
3. **对比度门禁**：从 tokens.css 解析色值，按 WCAG 2.1 相对亮度公式计算，
   **浅深两套都要过**：
   - `--ink-0` / `--surface` ≥ 7（AAA）
   - `--ink-2` / `--surface` ≥ 4.5
   - `--on-accent` / `--accent` ≥ 4.5
   - `--gold-text` / `--surface` ≥ 4.5
   - `--footer-link` / `--footer-bg` ≥ 4.5
4. **金色不当正文色**：`--gold` 对 `--surface` 的对比度低于 4.5 是**已知且刻意**的，
   所以断言 base/components 里 `color:` 属性不得直接使用 `var(--gold)`
   （`border-color`/`background`/`fill` 可以）。

## 9. 已有测试要同步改的地方（由主持 agent 在第二波做，wave-1 agent 不要碰 tests/）

- `tests/static-site.test.mjs:70` —— `assert.ok(references.includes('styles.css'))`
  改为断言三份新文件都被引用
- `tests/ui-source.test.mjs:162-169` —— `readSource('styles.css')` 改为读
  `styles/base.css` + `styles/components.css` 并合并后再匹配；四条断言语义不变

## 10. 实施分派

| Agent | 独占文件 | 任务 |
|---|---|---|
| — (主持) | `styles/tokens.css` | 第 4 节全部 token，浅深两套。**先做，其余三个 agent 依赖它** |
| A | `styles/base.css` | 第 7 节 base 归属的全部规则 |
| B | `styles/components.css` | 第 7 节 components 归属的全部规则 + 第 5 节布局 |
| C | `index.html` | 第 5 节结构改动 + 第 6 节 sprite 与 head/CSP |
| D | `src/ui.js` | 13 处 `<i class="fas fa-*">` 换成 `<svg class="icon"><use href="#i-*">` |

**文件归属互斥，任何 agent 不得改自己那份以外的文件**，包括 tests/。

wave-1 的 agent **不要跑 `npm run verify`**——那时候其他人的文件还没到位，必然红，
只会引发无意义的返工。各自只做自己文件的语法自检。第二波由主持统一跑 verify 并收拾残局。

## 11. 实施记录：规格与实际的偏差

四个 agent 各报了一处规格漏洞，都属实，处理如下。**记在这里是因为规格本身错了，不是执行错了。**

1. **图标数「14 处」是错的，实际 13 处。** 第 6.3 节把随空导航一起删除的 `fa-bars` 重复
   计了一次。sprite 仍是 16 个 symbol，`<use>` 引用 13 处（index.html）+ 13 处（ui.js）。
2. **缺 `--scrim` token。** 模态框遮罩在浅深两套下都得是「暗」的，不能跟着 `--surface` 翻转。
   原先没定，实施时只好借 `--footer-bg` 兑，语义错位。已补 `--scrim`。
3. **缺 `--ok-soft` token。** `.api-status.success` 需要绿色浅底，原先只有 `--gold-soft`
   与 `--accent-soft`。已补，并纳入第 8 节的对比度门禁。
4. **`.prov-link a` 的去向没写。** 第 5.5 节只说了 `.footer-credit a` 改用 `--footer-link`。
   `--footer-link` 是为深色页脚底调的，放在浅色卡片上几乎不可见，故 `.prov-link a` 用 `--gold-text`。
5. **`.api-status-bar` 包装层解散。** 第 5.1 节的示例 HTML 让子元素直接挂到 `.app-bar-actions`，
   等于解散了这个 div，但第 7 节仍把它列在 components.css 名下。已删除对应的死 CSS。

另有两处**只有真浏览器截图才看得出来**的缺陷，代码审查与测试都发现不了：

6. **原生勾选框是系统蓝。** 没设 `accent-color`，在暖色板里极扎眼，深色下尤甚。
   已在 base.css 给 `[type=checkbox]`/`[type=radio]` 设 `accent-color: var(--accent)`。
7. **「代理已连接」抢了主按钮的戏。** 实心 `--ok` 绿让一个**状态**成为整页最响的元素，
   把主操作「翻译」压下去。已退成 `--ok-soft` 浅底 + `--ok` 描边。

## 12. 验收

1. `npm run verify` 全绿（语法 / Worker dry-run / 术语 / 真浏览器冒烟 / Node 测试）
2. 新增 `tests/design-tokens.test.mjs` 四条门禁全绿，且每条都做过变异测试
3. 用真浏览器分别在浅色与深色下截图，肉眼确认：
   - 顶部不再有金色横幅，副标题可读
   - 页面底部内容不再被裁切
   - 深色下无残留的浅色硬编码块
