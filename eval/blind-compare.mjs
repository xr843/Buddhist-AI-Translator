/*
 * 生成盲评对照：本轮全部译文相关改动的「改前 vs 改后」。
 *
 * 为什么要盲评：这一轮所有质量判断都是我自己看着下的，而没有量的时候
 * 已经错过三次（术语库是护城河 / 术语库只加括注 / 上游没给许可）。
 * 「译得好不好」需要读得懂佛典汉文与英译的人判，而且必须隐去来源——
 * 知道哪边是自家的，就会不自觉偏向它。
 *
 * 两臂的差别就是本轮的全部改动：
 *   改前 = 0579c5a 的 style.js + lexicon.js（无保真规则、术语库按 n 排序、
 *          无跨界让路、无虚词表）
 *   改后 = 当前 master
 * 其余（同一段原文、同一目标语种、同一引擎）完全一致。
 *
 * 输出 eval/blind-pairs.json：每条带一个随机的 leftIsNew，页面据此排版，
 * 判完才揭晓。用法：
 *   node eval/blind-compare.mjs > eval/blind-pairs.json
 *
 * ⚠️ 上游约 10 次/分钟就回 429。默认每次请求间隔 8 秒，别往下调。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = process.env.PROXY_URL || 'https://buddhist-translator-api.lqsxianren.workers.dev';
const ORIGIN = process.env.ALLOWED_ORIGIN || 'https://xr843.github.io';
const BEFORE = process.env.BEFORE_REF || '0579c5a';
const GAP_MS = Number(process.env.GAP_MS || 8000);
const WANT = Number(process.env.WANT || 16);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function translate(chinese, context, styleInstruction) {
    const response = await fetch(`${PROXY}/mitra/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
            input_tibetan: '', input_chinese: chinese, input_pali: '', input_sanskrit: '',
            context, focus: 'equal', target_language: 'english',
            style_instruction: styleInstruction
        })
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const data = await response.json();
    if (typeof data?.translation !== 'string') throw new Error('unexpected payload');
    return data.translation.trim();
}

/** 把改前那两个文件取出来单独加载，比在脚本里重写旧逻辑可靠。 */
async function loadBeforeArm(rawLexicon) {
    const dir = path.join(os.tmpdir(), `blind-before-${BEFORE}`);
    await mkdir(dir, { recursive: true });

    for (const file of ['style.js', 'lexicon.js']) {
        const { stdout } = await run('git', ['show', `${BEFORE}:src/${file}`], { cwd: repoRoot, maxBuffer: 4e6 });
        await writeFile(path.join(dir, file), stdout);
    }

    const style = await import(path.join(dir, 'style.js'));
    const lexicon = await import(path.join(dir, 'lexicon.js'));
    lexicon.setLexicon(rawLexicon);

    return {
        instruction: style.buildStyleInstruction(style.defaultStyle()),
        context: text => lexicon.buildLexiconContext(text, rawLexicon)
    };
}

async function main() {
    const rawLexicon = JSON.parse(await readFile(path.join(repoRoot, 'src/data/lexicon.json'), 'utf8'));

    const before = await loadBeforeArm(rawLexicon);

    const styleNow = await import('../src/style.js');
    const lexiconNow = await import('../src/lexicon.js');
    lexiconNow.setLexicon(rawLexicon);
    const afterInstruction = styleNow.buildStyleInstruction(styleNow.defaultStyle());

    if (before.instruction === afterInstruction) {
        throw new Error('两臂的译风指令相同——改前的代码没取对，这样比是白比');
    }

    const passages = JSON.parse(await readFile(path.join(repoRoot, 'eval/passages.json'), 'utf8'));
    const pairs = [];

    for (const passage of passages) {
        if (pairs.length >= WANT) break;
        const label = `${pairs.length + 1}/${WANT} ${passage.title}`;

        try {
            const oldText = await translate(passage.text, before.context(passage.text), before.instruction);
            await sleep(GAP_MS);
            const newText = await translate(passage.text, lexiconNow.buildLexiconContext(passage.text, rawLexicon), afterInstruction);
            await sleep(GAP_MS);

            if (oldText === newText) {
                process.stderr.write(`${label}: 两臂逐字相同，跳过（判它没有意义）\n`);
                continue;
            }

            // 随机左右，页面只按这个排版，判完才揭晓
            const leftIsNew = (pairs.length + passage.text.length) % 2 === 0;
            pairs.push({
                id: pairs.length + 1,
                title: passage.title,
                text: passage.text,
                left: leftIsNew ? newText : oldText,
                right: leftIsNew ? oldText : newText,
                leftIsNew
            });
            process.stderr.write(`${label}: 已生成\n`);
        } catch (error) {
            process.stderr.write(`${label}: 失败 ${error.message}\n`);
            await sleep(GAP_MS * 2);
        }
    }

    process.stderr.write(`\n生成 ${pairs.length} 对；左边是改后的有 ${pairs.filter(p => p.leftIsNew).length} 条\n`);
    process.stdout.write(JSON.stringify(pairs, null, 1));
}

await main();
