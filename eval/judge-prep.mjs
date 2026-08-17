/*
 * 盲评的第二层：把 blind-pairs.json 编成判官吃的卷子。
 *
 * 为什么不能我自己判：这 15 对译文是照我写的六条保真规则生成的，
 * 我认得出自己的手笔——「改后」那一臂的措辞习惯我一眼就能挑出来。
 * 知道哪边是自家的，判出来必然偏向它。所以判官必须
 * (a) 不知道两臂各是什么，(b) 不知道这轮改了什么，(c) 彼此不通气。
 *
 * ── 三道防线 ────────────────────────────────────────────────
 *
 * 1. 位置偏好。判官普遍偏爱排在前面的那个。所以同一卷出两个版本，
 *    order=1 与 order=2 左右对调；**只有两个版本指向同一臂才算数**，
 *    对调后翻脸的算噪声，不计入胜负。
 *
 * 2. 判官有没有分辨力。混进 4 道**已知答案的对照题**：一边是完好的译文，
 *    另一边是同一段被明确弄坏的（整段砍掉三分之一、数目改错、语义反转）。
 *    判官若连这个都挑不出来，它在真题上的判断就是掷骰子，整轮作废。
 *    ⚠️ 对照题的破坏方式**故意不针对本轮任何一条规则**——
 *    否则就成了「用我的规则去证明我的规则」。
 *
 * 3. 答案分开存。judge-key.json 里才有哪题是对照、哪臂是改后，
 *    卷子里一个字都没有。
 *
 * 用法：
 *   node eval/judge-prep.mjs            # 生成 judge-order1.json / judge-order2.json / judge-key.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── 对照题：把好译文弄坏，弄法与本轮规则无关 ─────────────────── */

/** 砍掉末尾约三分之一，在句号处断开，读起来仍然通顺但漏掉整段内容。 */
function truncate(text) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const keep = Math.max(2, Math.floor(sentences.length * 0.62));
    return sentences.slice(0, keep).join(' ');
}

/** 把英文数目改成另一个数——原文说五就是五，改成三是硬伤。 */
function corruptNumber(text) {
    const swap = { five: 'three', four: 'six', three: 'seven', two: 'nine', seven: 'two', eight: 'five', ten: 'four' };
    for (const [from, to] of Object.entries(swap)) {
        const pattern = new RegExp(`\\b${from}\\b`, 'i');
        if (pattern.test(text)) return text.replace(pattern, to);
    }
    return null;
}

/** 语义反转：把一处否定去掉，命题跟着反过来。 */
function invertNegation(text) {
    const patterns = [
        [/\bdoes not\b/i, 'does'],
        [/\bdo not\b/i, 'do'],
        [/\bneither increases nor decreases\b/i, 'both increases and decreases'],
        [/\bis not\b/i, 'is'],
        [/\bcannot\b/i, 'can'],
        [/\bwithout\b/i, 'with']
    ];
    for (const [pattern, replacement] of patterns) {
        if (pattern.test(text)) return text.replace(pattern, replacement);
    }
    return null;
}

const DAMAGE = [
    { kind: 'truncate', apply: truncate, why: '砍掉末尾约三分之一' },
    { kind: 'number', apply: corruptNumber, why: '数目改错' },
    { kind: 'negation', apply: invertNegation, why: '去掉否定，命题反转' },
    { kind: 'truncate', apply: truncate, why: '砍掉末尾约三分之一' }
];

/* ── 编卷 ─────────────────────────────────────────────────────── */

async function main() {
    const pairs = JSON.parse(await readFile(path.join(repoRoot, 'eval/blind-pairs.json'), 'utf8'));

    const items = [];

    for (const pair of pairs) {
        items.push({
            source: pair.text,
            first: pair.left,
            second: pair.right,
            key: { type: 'real', id: pair.id, title: pair.title, firstIsNew: pair.leftIsNew }
        });
    }

    // 对照题从不同的经取，均匀撒在卷子里；用「改前」那一臂当好本，
    // 免得对照题的胜负和真题的胜负纠缠在一起。
    let damageIndex = 0;
    for (const pair of pairs) {
        if (damageIndex >= DAMAGE.length) break;
        const intact = pair.leftIsNew ? pair.right : pair.left;
        const damage = DAMAGE[damageIndex];
        const broken = damage.apply(intact);
        if (!broken || broken === intact || broken.length < 80) continue;

        // 完好本一半排前一半排后，免得「排后面的总是对的」变成可学的规律
        const intactFirst = damageIndex % 2 === 0;
        items.push({
            source: pair.text,
            first: intactFirst ? intact : broken,
            second: intactFirst ? broken : intact,
            key: { type: 'control', id: `C${damageIndex + 1}`, title: pair.title, why: damage.why, intactFirst }
        });
        damageIndex += 1;
    }

    if (damageIndex < DAMAGE.length) {
        throw new Error(`只造出 ${damageIndex} 道对照题，少于 ${DAMAGE.length} 道——分辨力检验会不够灵敏`);
    }

    // 打散，让对照题不扎堆在末尾。不用随机数：脚本要可复跑。
    items.sort((a, b) => (a.source.length % 7) - (b.source.length % 7) || a.key.id.toString().localeCompare(b.key.id.toString()));

    const order1 = [];
    const order2 = [];
    const key = [];

    items.forEach((item, index) => {
        const number = index + 1;
        order1.push({ n: number, source: item.source, A: item.first, B: item.second });
        order2.push({ n: number, source: item.source, A: item.second, B: item.first });
        key.push({ n: number, ...item.key });
    });

    await writeFile(path.join(repoRoot, 'eval/judge-order1.json'), JSON.stringify(order1, null, 1));
    await writeFile(path.join(repoRoot, 'eval/judge-order2.json'), JSON.stringify(order2, null, 1));
    await writeFile(path.join(repoRoot, 'eval/judge-key.json'), JSON.stringify(key, null, 1));

    const controls = key.filter(entry => entry.type === 'control');
    process.stderr.write(
        `卷子已生成：${key.length} 题（真题 ${key.length - controls.length} + 对照 ${controls.length}）\n`
        + `对照题在第 ${controls.map(c => c.n).join('、')} 题\n`
        + `order1 与 order2 的 A/B 完全对调；答案只在 judge-key.json\n`
    );
}

await main();
