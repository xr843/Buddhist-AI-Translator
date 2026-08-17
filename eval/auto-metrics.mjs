/*
 * 盲评的第一层：不需要人判断的部分。
 *
 * 为什么要有这一层：`eval/blind-review.html` 要人逐条读译文，成本高到实际上没人会做，
 * 结果是这一轮改动至今**没有任何量**支撑。但六条保真规则里有三条本身就是
 * 可机器判定的——它们说的是「必须/不许出现某种形态」，不是「哪个译得好」。
 * 这三条能在零判断的前提下量出来，剩下三条才需要交给判断。
 *
 * ⚠️ 这一层量的是**规则遵守度**，不是**译文质量**。
 *    规则遵守 100% 也可能译得很差；这里的数字只能回答
 *    「改后是否真的做到了它承诺的事」，不能回答「改后是否更好」。
 *
 * ── 事先声明要测什么（跑之前写死，免得看到结果再挑对自己有利的指标）──
 *
 *   规则 6「只输出译文」        → violations.note    附注、文义解释、跨本比较
 *   规则 6「括号里只能放一个词」→ violations.parenSentence  括号内 > 4 词
 *   规则 3「数目不能省」        → numerals.missing   原文的计数式数目在译文中找不到
 *   规则 2「固定语保留意象」    → stock.missing      仅对原文含该固定语的条目计
 *
 * 不可机器判定、留给第二层的三条：
 *   规则 1 引语内人称、规则 4 括注挂靠位置、规则 5 印度语词形态是否为既有标准形式。
 *
 * 另量一个**混淆变量**：两臂的长度比。判断者普遍偏爱更长的答案，
 * 若某一臂系统性更长，第二层的胜负就要打折看。
 *
 * 用法：node eval/auto-metrics.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── 规则 6：附注与解释 ───────────────────────────────────────── */

// 只认「另起一句在讲这段文字本身」的开头，不认正文里的普通句子。
const NOTE_OPENERS = [
    /\bN\.?B\.?[:.]/i,
    /\bNote\s*[:—-]/i,
    /\bcf\.\s/i,
    /\bThis (?:passage|verse|section|text|line)\b/i,
    /\bThe (?:Pali|Pāli|Tibetan|Sanskrit|Chinese) (?:parallel|version|text|witness|reads)\b/i,
    /\bIn the (?:Pali|Pāli|Tibetan|Sanskrit) (?:version|parallel|text)\b/i,
    /\b(?:corresponds? to|parallel(?:s|ed)? (?:in|to))\b/i,
    /\bhere (?:means|refers to|denotes)\b/i,
    // ⚠️ 结尾是标点的，后面不能再加 \b —— `.` 与空格都不是词字符，永远匹配不上。
    // 这条曾经就是这么写的，变异测试一喂 "i.e. materiality" 就露馅了。
    /\b(?:i\.e\.|e\.g\.|that is to say)/i,
    /\bTranslator'?s? note\b/i
];

function noteViolations(text) {
    const hits = [];
    for (const pattern of NOTE_OPENERS) {
        const match = text.match(pattern);
        if (match) hits.push(match[0].trim());
    }
    return hits;
}

/* ── 规则 6：括号里只能放一个词 ───────────────────────────────── */

function parenSentenceViolations(text) {
    const hits = [];
    for (const match of text.matchAll(/\(([^()]{0,400})\)/g)) {
        const inside = match[1].trim();
        if (!inside) continue;
        const words = inside.split(/\s+/).filter(Boolean);
        // 「śūnyatā」「the five aggregates」算词条；超过 4 词，或含句末标点，算句子
        if (words.length > 4 || /[.;?!]\s/.test(inside) || /\w[.?!]$/.test(inside)) {
            hits.push(inside.length > 60 ? inside.slice(0, 60) + '…' : inside);
        }
    }
    return hits;
}

/* ── 规则 3：计数式数目不能省 ─────────────────────────────────── */

/*
 * 复合数词必须先于单字匹配，否则「十八不共法」会被拆成「十」和「八」，
 * 再拿 ten / eight 去译文里找 —— 译文写的是 eighteen，两个都找不到，
 * 一处正确的翻译被记成两处漏译。第一版就是这么错的。
 */
const COMPOUND_NUMERALS = [
    ['三十七', ['thirty-seven', 'thirty seven', '37']],
    ['十八', ['eighteen', '18']],
    ['十七', ['seventeen', '17']],
    ['十六', ['sixteen', '16']],
    ['十五', ['fifteen', '15']],
    ['十四', ['fourteen', '14']],
    ['十三', ['thirteen', '13']],
    ['十二', ['twelve', 'twelvefold', '12']],
    ['十一', ['eleven', '11']],
    ['十九', ['nineteen', '19']],
    ['二十', ['twenty', '20']],
    ['三十', ['thirty', '30']],
    ['五十', ['fifty', '50']]
];

// 汉文数词 → 英译里可以接受的对应形态
const NUMERALS = [
    ['二', ['two', 'both', 'twofold', 'dual', 'pair', 'second', '2']],
    ['三', ['three', 'threefold', 'triple', 'third', '3']],
    ['四', ['four', 'fourfold', 'fourth', '4']],
    ['五', ['five', 'fivefold', 'fifth', '5']],
    ['六', ['six', 'sixfold', 'sixth', '6']],
    ['七', ['seven', 'sevenfold', 'seventh', '7']],
    ['八', ['eight', 'eightfold', 'eighth', '8']],
    ['九', ['nine', 'ninth', '9']],
    ['十', ['ten', 'tenth', 'tenfold', '10']],
    ['百', ['hundred', '100']],
    ['千', ['thousand', '1,000', '1000']]
];

/*
 * 这些里的数字不是在计数，当成漏译就是误报。
 * 「三藐三菩提」（samyak-saṃbodhi）尤其要挡 —— 它是音译用字，
 * 大般若系的段落里几乎每段都有，不挡的话两臂各被记一堆假漏译，
 * 真实的差异全被这些噪声淹掉。
 */
const NOT_COUNTING = /^(?:一切|一者|二者|三者|四者|五者|六者|七者|八者|九者|十者|第[一二三四五六七八九十])/;
const TRANSLITERATION = /^(?:三藐|三菩提|三佛|三昧|三摩|三千|二合)/;

function sourceNumerals(chinese) {
    const found = new Set();
    const consumed = new Set();

    const record = (cjk, forms, index, length) => {
        // 复合数词之间也要互斥：不查这一行，「三十七」里的「十七」会被再认领一次，
        // 于是「thirty-seven」译得完全正确的段落被报成漏译「十七」。
        for (let offset = 0; offset < length; offset += 1) {
            if (consumed.has(index + offset)) return;
        }
        const window = chinese.slice(index, index + 3);
        if (NOT_COUNTING.test(window) || TRANSLITERATION.test(window)) return;
        // 后面得跟一个字（「二業」「五蘊」），孤零零一个数字多半是序号
        if (!/[一-鿿]/.test(chinese[index + length] || '')) return;
        for (let offset = 0; offset < length; offset += 1) consumed.add(index + offset);
        found.add(JSON.stringify([cjk, forms]));
    };

    // 复合数词先扫，扫过的位置标记掉，单字扫描不再重复认领
    for (const [cjk, forms] of COMPOUND_NUMERALS) {
        let index = chinese.indexOf(cjk);
        while (index !== -1) {
            record(cjk, forms, index, cjk.length);
            index = chinese.indexOf(cjk, index + 1);
        }
    }

    for (const [cjk, forms] of NUMERALS) {
        let index = chinese.indexOf(cjk);
        while (index !== -1) {
            record(cjk, forms, index, 1);
            index = chinese.indexOf(cjk, index + 1);
        }
    }

    return [...found].map(entry => JSON.parse(entry));
}

function missingNumerals(chinese, english) {
    const lower = english.toLowerCase();
    return sourceNumerals(chinese)
        .filter(([, forms]) => !forms.some(form => new RegExp(`\\b${form}\\b`, 'i').test(lower)))
        .map(([cjk]) => cjk);
}

/* ── 规则 2：固定语保留意象 ───────────────────────────────────── */

// 只列意象明确、丢了就能看出来的。原文没有这个词的条目不计入分母。
const STOCK = [
    ['長夜', ['long night'], '长夜'],
    ['长夜', ['long night'], '长夜'],
    ['如是我聞', ['thus have i heard', 'thus i have heard'], '如是我闻'],
    ['善男子', ['good son', 'son of good family', 'noble son'], '善男子'],
    ['甘露', ['nectar', 'ambrosia', 'deathless', 'amṛta', 'amrta'], '甘露'],
    ['彼岸', ['other shore', 'far shore', 'beyond'], '彼岸'],
    ['火宅', ['burning house', 'house on fire'], '火宅'],
    ['盲龜', ['blind turtle', 'blind tortoise'], '盲龟'],
    ['筏', ['raft'], '筏喻']
];

function missingStock(chinese, english) {
    const lower = english.toLowerCase();
    return STOCK
        .filter(([cjk]) => chinese.includes(cjk))
        .filter(([, forms]) => !forms.some(form => lower.includes(form)))
        .map(([, , label]) => label);
}

/* ── 规则 5 的近似量：括注里的梵文词有没有出处 ─────────────────── */

/*
 * 规则 5 说印度语词要用「佛教梵语既有的完整标准形式」，不许截短、不许自造。
 * 「是不是既有形式」没法凭空判定，但可以查：这个词在 8,610 条平行语料
 * 挖出来的术语库里出现过吗？出现过就至少有出处。
 *
 * ⚠️ 这是**近似量，不是判决**。术语库只覆盖特定平行语料，
 *    查不到完全可能是正确却没被收录的词。所以这里只报**候选清单**，
 *    真正有意义的是**两臂的条数差**——同样的词表、同样的段落，
 *    一臂的无出处括注明显更多，才说明问题。
 */
const INDIC = /[āīūṛṝḷṅñṇṭḍśṣṃḥ]/;

function indicGlosses(text) {
    const glosses = [];
    for (const match of text.matchAll(/\(([^()]{1,80})\)/g)) {
        const inside = match[1].trim();
        if (!INDIC.test(inside)) continue;
        if (inside.split(/\s+/).length > 3) continue;   // 整句不算术语括注
        glosses.push(inside);
    }
    return glosses;
}

function buildAttested(lexicon) {
    const attested = new Set();
    for (const entry of Object.values(lexicon.entries)) {
        for (const [form] of entry.sa || []) {
            const lower = form.toLowerCase();
            attested.add(lower);
            // 复合词按连字符与空格拆开，各段也算有出处
            for (const part of lower.split(/[-\s]+/)) {
                if (part.length > 2) attested.add(part);
            }
        }
    }
    return attested;
}

function unattestedGlosses(text, attested) {
    return indicGlosses(text).filter(gloss => {
        const lower = gloss.toLowerCase().replace(/[,;.]/g, '');
        if (attested.has(lower)) return false;
        // 整体查不到时，逐段查；每段都有出处就算有出处
        const parts = lower.split(/[-\s]+/).filter(part => part.length > 2);
        return !(parts.length > 1 && parts.every(part => attested.has(part)));
    });
}

/* ── 汇总 ─────────────────────────────────────────────────────── */

function measure(chinese, english, attested) {
    return {
        chars: english.length,
        note: noteViolations(english),
        parenSentence: parenSentenceViolations(english),
        numeralsMissing: missingNumerals(chinese, english),
        stockMissing: missingStock(chinese, english),
        glosses: indicGlosses(english),
        glossesUnattested: attested ? unattestedGlosses(english, attested) : []
    };
}

async function main() {
    const pairs = JSON.parse(await readFile(path.join(repoRoot, 'eval/blind-pairs.json'), 'utf8'));
    const lexicon = JSON.parse(await readFile(path.join(repoRoot, 'src/data/lexicon.json'), 'utf8'));
    const attested = buildAttested(lexicon);

    const totals = {
        before: { note: 0, paren: 0, numerals: 0, stock: 0, chars: 0, glosses: 0, unattested: 0 },
        after: { note: 0, paren: 0, numerals: 0, stock: 0, chars: 0, glosses: 0, unattested: 0 }
    };
    let numeralOpportunities = 0;
    let stockOpportunities = 0;
    const rows = [];

    for (const pair of pairs) {
        const newText = pair.leftIsNew ? pair.left : pair.right;
        const oldText = pair.leftIsNew ? pair.right : pair.left;
        const after = measure(pair.text, newText, attested);
        const before = measure(pair.text, oldText, attested);

        numeralOpportunities += sourceNumerals(pair.text).length;
        stockOpportunities += STOCK.filter(([cjk]) => pair.text.includes(cjk)).length;

        for (const [key, m] of [['before', before], ['after', after]]) {
            totals[key].note += m.note.length;
            totals[key].paren += m.parenSentence.length;
            totals[key].numerals += m.numeralsMissing.length;
            totals[key].stock += m.stockMissing.length;
            totals[key].chars += m.chars;
            totals[key].glosses += m.glosses.length;
            totals[key].unattested += m.glossesUnattested.length;
        }

        rows.push({ pair, before, after });
    }

    const line = '─'.repeat(74);
    console.log('规则遵守度（改前 → 改后；数字越小越好）');
    console.log(line);
    console.log('条目  经                    附注违规      括号塞句      数目漏译      固定语丢失');
    for (const { pair, before, after } of rows) {
        const cell = (b, a) => {
            const mark = a.length < b.length ? '↓' : a.length > b.length ? '↑' : ' ';
            return `${b.length}→${a.length}${mark}`.padEnd(14);
        };
        console.log(
            `${String(pair.id).padStart(3)}.  ${pair.title.padEnd(12)}  `
            + cell(before.note, after.note)
            + cell(before.parenSentence, after.parenSentence)
            + cell(before.numeralsMissing, after.numeralsMissing)
            + cell(before.stockMissing, after.stockMissing)
        );
    }
    console.log(line);
    console.log(`合计  改前 → 改后`);
    console.log(`  规则6 附注/解释违规      ${totals.before.note} → ${totals.after.note}`);
    console.log(`  规则6 括号内塞进整句    ${totals.before.paren} → ${totals.after.paren}`);
    console.log(`  规则3 数目漏译          ${totals.before.numerals} → ${totals.after.numerals}  （共 ${numeralOpportunities} 处该译的数目）`);
    console.log(`  规则2 固定语意象丢失    ${totals.before.stock} → ${totals.after.stock}  （共 ${stockOpportunities} 处该保留的固定语）`);
    console.log(`  规则5 括注梵文词总数    ${totals.before.glosses} → ${totals.after.glosses}`);
    console.log(`        其中术语库查无出处  ${totals.before.unattested} → ${totals.after.unattested}  ⚠️ 近似量，见文件顶部说明`);
    console.log(line);
    const ratio = totals.after.chars / totals.before.chars;
    console.log(`长度比（混淆变量）：改后 / 改前 = ${ratio.toFixed(3)}`);
    console.log(
        Math.abs(ratio - 1) < 0.05
            ? '  两臂长度相当，第二层的判断不易被「偏爱更长答案」污染。'
            : `  ⚠️ 相差 ${((ratio - 1) * 100).toFixed(1)}%，第二层若判改后更好，要先排除是不是只因为它更长。`
    );

    // 明细：只打违规的，方便逐条核
    const detail = [];
    for (const { pair, before, after } of rows) {
        for (const [arm, m] of [['改前', before], ['改后', after]]) {
            for (const hit of m.note) detail.push(`  #${pair.id} ${arm} 附注：${hit}`);
            for (const hit of m.parenSentence) detail.push(`  #${pair.id} ${arm} 括号塞句：(${hit})`);
            for (const hit of m.numeralsMissing) detail.push(`  #${pair.id} ${arm} 漏数目：${hit}`);
            for (const hit of m.stockMissing) detail.push(`  #${pair.id} ${arm} 丢固定语：${hit}`);
            for (const hit of m.glossesUnattested) detail.push(`  #${pair.id} ${arm} 括注查无出处：${hit}`);
        }
    }
    if (detail.length) {
        console.log(`\n违规明细（共 ${detail.length} 条，供人工复核）`);
        console.log(detail.join('\n'));
    }
}

// 探测器要能被 tests/auto-metrics.test.mjs 单独喂已知坏值。
// 那组测试不是装饰：`i.e.` 那条规则曾经因为多写一个 \b 而永远不响，
// 是变异测试把它揪出来的，不是读代码读出来的。
export { noteViolations, parenSentenceViolations, missingNumerals, missingStock, sourceNumerals };

// 被 import 时只取探测器，不要顺手把报告也打一遍
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}
