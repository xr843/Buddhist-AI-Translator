# 实证对照索引 `src/data/lexicon.json`

汉语佛典术语 → 梵文原语 / 藏译的索引，由 [dharmamitra-lexicon](https://github.com/dharmamitra/dharmamitra-lexicon)
（CC BY 4.0）派生而来。上游是从对齐的平行语料中挖出的**逐词/逐短语对译片段**，
每条记录是一次真实出现，不是人工编纂的词条。

## 它跟 `src/terms.json` 的分工

| | `src/terms.json` | `src/data/lexicon.json` |
|---|---|---|
| 来源 | 人工编写 | 平行语料自动挖掘 |
| 规模 | 55 条 | 8,610 条 |
| 带什么 | 译名 + 解释 | 梵文原语、藏译、出现次数、大正藏经号 |
| 权威性 | 逐条审定 | 未逐条审定，靠出现次数与过滤保证 |
| 加载 | 随首屏 | 首次翻译时按需加载（约 830 KB / gzip 228 KB） |

两层互补：`terms.json` 是可以直接信的核心表，`lexicon.json` 是覆盖面。
被过滤规则误伤的常用词（如「八正道」「轉法輪」），应当补进 `terms.json`。

## 重新构建

```bash
git clone --depth 1 https://github.com/dharmamitra/dharmamitra-lexicon.git /tmp/dharmamitra-lexicon
node scripts/build-lexicon.mjs --input /tmp/dharmamitra-lexicon
```

上游数据约 6.3 GB，构建耗时约 25 秒，产物直接覆盖 `src/data/lexicon.json`。
产物里的 `meta.upstreamCommit` 记录了这次构建对应的上游提交，换版本时要一起更新。

## 过滤规则是怎么定的

初版只按出现次数过滤，出来 14,185 条。**随机抽 25 条人工逐条判读，约一半不是术语**，
而是句法碎片（「何等名」「汝所說」「三世中」「亦有二種」）。

分桶再测，找到了区分度最高的一个信号：

| 分桶 | 条数 | 抽样人工判读的精确率 |
|---|---|---|
| 有梵文原语 | 9,739（69%） | 30 条里约 27 条是真词项（≈90%） |
| 只有藏译 | 4,446（31%） | 20 条里约 6 条是真词项（≈30%） |

原因说得通：sa-zh 那一侧是在**已词元化的梵语**上做跨语投影的，
一个汉语串如果从来对不上任何一个梵语词元，它多半本来就不是一个词。

于是定了两条：

1. `REQUIRE_SANSKRIT` —— 必须有梵文原语。
2. `MIN_TOP_SANSKRIT_SHARE = 0.25` —— 首选原语要占该词梵语侧出现总数的四分之一以上。
   句法碎片的对译是发散的（「又問」的首选原语只占 2%），真词项是收敛的。

加上这两条后是 8,610 条。**换一个随机种子重抽 40 条**（不能用调参时那批，否则是自证），
人工逐条判读：5 条仍是句法碎片（麁等 / 住中 / 名菩薩 / 心平等 / 象等），
**精确率 87.5%**。这个数字记在产物的 `meta.sampledPrecision` 里。

代价：只对得上藏译的真术语会被剔掉，已知的有「八正道」「轉法輪」。

## 复现这次抽样

```bash
node -e '
const fs = require("fs");
const entries = Object.keys(JSON.parse(fs.readFileSync("src/data/lexicon.json")).entries).sort();
// 换一个自己的种子，别用文档里这个
let s = 20260814;
const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = new Set();
while (pick.size < 40) pick.add(entries[Math.floor(rand() * entries.length)]);
console.log([...pick].join("\n"));
'
```

判读标准：这个汉语串在佛典里是不是一个**词项**（术语、专名、实词），
还是只是一段被切出来的句法片段。是词项就算对，哪怕它不是义理术语（「乳母」「十八歲」算对）。

## 许可与署名

数据依 **CC BY 4.0** 使用，署名对象是 **Dharmamitra project（东北大学 MITRA）**。
上游 README 另有一项请求：公开产品若用了这批数据，**上线前**给
`dharmamitra-project@gmail.com` 去一封信告知。这不是许可条件，但应当照办。
