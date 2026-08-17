/*
 * 盲评的第三步：把六份答卷对着答案算分。
 *
 * ⚠️ 判分规则在看到任何一份答卷之前就写死在这里了。
 *    先看结果再挑算法，等于自己给自己发奖状。
 *
 * ── 判分怎么算 ────────────────────────────────────────────────
 *
 * 1. **先验分辨力**。4 道对照题（一边是完好译文，一边被明确弄坏）先算。
 *    判官整体正确率 < 75% 就整轮作废——连砍掉三分之一段落都挑不出来的判官，
 *    在真题上的判断是掷骰子，再漂亮的比分也不能信。
 *
 * 2. **位置偏好**。统计所有非平局判断里选 A 的比例。
 *    显著偏离 50% 说明判官在按位置而不是按译文判。
 *
 * 3. **对调一致**。同一题在 order1 与 order2 下 A/B 完全对调。
 *    两边的多数意见指向同一臂才算数；对调后翻脸的记为噪声，不计胜负。
 *    这是本脚本最要紧的一道闸——它把「判官真看出差别」和
 *    「判官只是随手选了个位置」分开。
 *
 * 4. **符号检验**。给出 p 值。15 题的样本很小，
 *    9:6 这种比分和抛硬币没区别，必须让数字自己说出来。
 *
 * 用法：node eval/judge-score.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.env.EXAM_DIR
    || '/tmp/claude-1000/-home-lqsxi-projects-Buddhist-AI-Translator/a0473c0b-68eb-4ccc-b0b8-060594621c5c/scratchpad';

const PAPERS = [
    { id: '1a', order: 1 }, { id: '1b', order: 1 }, { id: '1c', order: 1 },
    { id: '2a', order: 2 }, { id: '2b', order: 2 }, { id: '2c', order: 2 }
];

/** order1: A=first, B=second。order2 全部对调。 */
function resolveArm(verdict, order, firstIsNew) {
    if (verdict === 'TIE') return 'tie';
    const pickedFirst = order === 1 ? verdict === 'A' : verdict === 'B';
    return pickedFirst === firstIsNew ? 'new' : 'old';
}

function resolveControl(verdict, order, intactFirst) {
    if (verdict === 'TIE') return 'tie';
    const pickedFirst = order === 1 ? verdict === 'A' : verdict === 'B';
    return pickedFirst === intactFirst ? 'correct' : 'wrong';
}

/** 二项检验（双尾符号检验）。w 胜 l 负，平局不计入。 */
function signTest(w, l) {
    const n = w + l;
    if (n === 0) return 1;
    const logFactorial = [0];
    for (let i = 1; i <= n; i += 1) logFactorial[i] = logFactorial[i - 1] + Math.log(i);
    const choose = (a, b) => Math.exp(logFactorial[a] - logFactorial[b] - logFactorial[a - b]);
    const extreme = Math.max(w, l);
    let tail = 0;
    for (let k = extreme; k <= n; k += 1) tail += choose(n, k) * Math.pow(0.5, n);
    return Math.min(1, 2 * tail);
}

function majority(arms) {
    const counts = { new: 0, old: 0, tie: 0 };
    for (const arm of arms) counts[arm] += 1;
    if (counts.new > counts.old) return 'new';
    if (counts.old > counts.new) return 'old';
    return 'tie';
}

async function main() {
    const key = JSON.parse(await readFile(path.join(repoRoot, 'eval/judge-key.json'), 'utf8'));
    const byNumber = new Map(key.map(entry => [entry.n, entry]));

    const papers = [];
    for (const paper of PAPERS) {
        const file = path.join(scratch, `exam-${paper.id}`, 'verdicts.json');
        let verdicts;
        try {
            verdicts = JSON.parse(await readFile(file, 'utf8'));
        } catch (error) {
            console.log(`⚠️ 判官 ${paper.id} 的答卷读不到（${error.code || error.message}），本轮少一份`);
            continue;
        }
        papers.push({ ...paper, verdicts: new Map(verdicts.map(v => [v.n, String(v.verdict).toUpperCase()])), raw: verdicts });
    }

    if (papers.length < 4) {
        console.log(`只收到 ${papers.length} 份答卷，不足以判——至少要 4 份（两种排布各 2 份）`);
        return;
    }

    const line = '═'.repeat(70);

    /* ── 闸门 1：判官有没有分辨力 ── */
    console.log(line);
    console.log('闸门 1　判官分辨力（4 道已知答案的对照题）');
    console.log(line);
    let controlCorrect = 0;
    let controlTotal = 0;
    for (const paper of papers) {
        let correct = 0;
        let total = 0;
        for (const entry of key.filter(k => k.type === 'control')) {
            const verdict = paper.verdicts.get(entry.n);
            if (!verdict) continue;
            const result = resolveControl(verdict, paper.order, entry.intactFirst);
            total += 1;
            if (result === 'correct') correct += 1;
        }
        controlCorrect += correct;
        controlTotal += total;
        console.log(`  判官 ${paper.id}（排布 ${paper.order}）：${correct}/${total}`);
    }
    const controlRate = controlTotal ? controlCorrect / controlTotal : 0;
    console.log(`  合计 ${controlCorrect}/${controlTotal} = ${(controlRate * 100).toFixed(0)}%`);
    const gatePassed = controlRate >= 0.75;
    console.log(gatePassed
        ? '  ✅ 通过（≥75%）：判官确实能认出被弄坏的译文，下面的比分可以往下看。'
        : '  ❌ 未通过（<75%）：判官连明确的破坏都挑不出来，真题上的比分是噪声，整轮作废。');

    /* ── 闸门 2：位置偏好 ── */
    console.log(`\n${line}`);
    console.log('闸门 2　位置偏好（判官是不是只在按位置选）');
    console.log(line);
    let pickedA = 0;
    let decided = 0;
    for (const paper of papers) {
        for (const [, verdict] of paper.verdicts) {
            if (verdict === 'TIE') continue;
            decided += 1;
            if (verdict === 'A') pickedA += 1;
        }
    }
    const aRate = decided ? pickedA / decided : 0;
    console.log(`  非平局判断 ${decided} 次，选 A ${pickedA} 次 = ${(aRate * 100).toFixed(0)}%`);
    console.log(Math.abs(aRate - 0.5) <= 0.15
        ? '  ✅ 接近 50%，没有明显的位置偏好。'
        : `  ⚠️ 偏离 50% 达 ${((aRate - 0.5) * 100).toFixed(0)} 个百分点——判官偏爱排在${aRate > 0.5 ? '前' : '后'}面的那个，胜负要打折看。`);

    /* ── 正题：对调一致的胜负 ── */
    console.log(`\n${line}`);
    console.log('正题　15 道真题：改后 vs 改前');
    console.log(line);
    console.log('题号  经                     排布1        排布2        对调一致?');

    let newWins = 0;
    let oldWins = 0;
    let ties = 0;
    let flipped = 0;
    const detail = [];

    for (const entry of key.filter(k => k.type === 'real')) {
        const armsOrder1 = [];
        const armsOrder2 = [];
        for (const paper of papers) {
            const verdict = paper.verdicts.get(entry.n);
            if (!verdict) continue;
            const arm = resolveArm(verdict, paper.order, entry.firstIsNew);
            (paper.order === 1 ? armsOrder1 : armsOrder2).push(arm);
        }
        const m1 = majority(armsOrder1);
        const m2 = majority(armsOrder2);

        let outcome;
        if (m1 === m2) {
            outcome = m1;
            if (m1 === 'new') newWins += 1;
            else if (m1 === 'old') oldWins += 1;
            else ties += 1;
        } else {
            outcome = 'flip';
            flipped += 1;
        }

        const label = { new: '改后', old: '改前', tie: '平', flip: '✗ 翻脸' };
        console.log(
            `${String(entry.n).padStart(3)}.  ${entry.title.padEnd(12)}  `
            + `${label[m1].padEnd(10)}  ${label[m2].padEnd(10)}  ${m1 === m2 ? '✓' : '✗'}`
        );
        detail.push({ n: entry.n, title: entry.title, m1, m2, outcome });
    }

    console.log(line);
    console.log(`对调一致的题：${newWins + oldWins + ties} / 15　（翻脸 ${flipped} 题，记为噪声不计胜负）`);
    console.log(`  改后胜 ${newWins}　改前胜 ${oldWins}　分不出 ${ties}`);

    const p = signTest(newWins, oldWins);
    console.log(`\n符号检验：${newWins} 胜 ${oldWins} 负，p = ${p.toFixed(3)}`);

    console.log(`\n${line}`);
    console.log('结论');
    console.log(line);
    if (!gatePassed) {
        console.log('判官没通过分辨力检验，本轮不产生结论。');
    } else if (newWins + oldWins < 5) {
        console.log(`对调一致且分出胜负的只有 ${newWins + oldWins} 题，样本太小，不产生结论。`);
        console.log('这本身也是个结果：两臂差别小到判官在对调后就守不住立场。');
    } else if (p < 0.05) {
        console.log(newWins > oldWins
            ? `✅ 改后显著更好（p = ${p.toFixed(3)}）。`
            : `❌ 改前显著更好（p = ${p.toFixed(3)}）——本轮改动是净负面，要逐条回看改坏了哪几处。`);
    } else {
        console.log(`⚖️ 分不出高下（p = ${p.toFixed(3)}，未达 0.05）。`);
        console.log('   在这 15 段上，本轮改动没有产生判官能稳定察觉的质量差异。');
        console.log('   注意这**不等于**「改动无用」——它排除的是「有大幅提升」，');
        console.log('   小幅提升需要更大样本才量得出来。');
    }
}

await main();
