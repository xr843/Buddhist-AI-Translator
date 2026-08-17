/*
 * 决定性实验：术语库到底该不该存在。
 *
 * 为什么先问这个，而不是先去清那 169 条垃圾条目：
 * 2026-08-17 的盲评里，三处被 6/6 位判官独立点名的缺陷**全是括注注错**
 * （妙→anuttara、有罪/無罪→同一个 anavadya、白佛言→ah）。
 * 而术语库的全部职责就是喂括注。
 *
 * 此前所有测试只证明了术语库**会改变**输出（15 段里 15 段选词不同），
 * **从没测过它是否改好**。在不知道一个部件是正是负的时候去调它的参数，顺序是反的。
 *
 * 两臂只差一个变量：
 *   ON   术语库 context 照常送   —— 当前线上的行为
 *   OFF  context 送空字符串     —— 其余（译风指令、段落、目标语种）逐字相同
 *
 * 输出与 blind-pairs.json 同一格式，直接喂给 eval/judge-prep.mjs。
 * `leftIsNew` 在这里读作「左边是 ON 臂」。
 *
 * ⚠️ 上游约 10 次/分钟回 429，默认间隔 8 秒，别往下调——那是别人的免费接口。
 * ⚠️ Node 的 fetch 不读 https_proxy，走代理的机器要 NODE_USE_ENV_PROXY=1。
 *
 * 用法：
 *   PASSAGES=eval/passages-40.json node eval/lexicon-onoff.mjs > eval/lexicon-onoff-pairs.json
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = process.env.PROXY_URL || 'https://buddhist-translator-api.lqsxianren.workers.dev';
const ORIGIN = process.env.ALLOWED_ORIGIN || 'https://xr843.github.io';
const GAP_MS = Number(process.env.GAP_MS || 8000);
const PASSAGES = process.env.PASSAGES || 'eval/passages.json';

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

async function main() {
    const rawLexicon = JSON.parse(await readFile(path.join(repoRoot, 'src/data/lexicon.json'), 'utf8'));
    const lexicon = await import('../src/lexicon.js');
    lexicon.setLexicon(rawLexicon);

    const { buildStyleInstruction, defaultStyle } = await import('../src/style.js');
    const instruction = buildStyleInstruction(defaultStyle());

    // path.resolve 而不是 join：这样 PASSAGES 给绝对路径也吃得下
    const passages = JSON.parse(await readFile(path.resolve(repoRoot, PASSAGES), 'utf8'));
    const pairs = [];
    let skippedEmpty = 0;
    let skippedSame = 0;

    for (const passage of passages) {
        const context = lexicon.buildLexiconContext(passage.text, rawLexicon);
        const label = `${pairs.length + 1}/${passages.length} ${passage.title}`;

        // 术语库对这一段本来就没有命中的话，两臂必然逐字相同，判它没有意义
        if (!context.trim()) {
            skippedEmpty += 1;
            process.stderr.write(`跳过 ${passage.title}: 术语库对这段零命中\n`);
            continue;
        }

        try {
            const on = await translate(passage.text, context, instruction);
            await sleep(GAP_MS);
            const off = await translate(passage.text, '', instruction);
            await sleep(GAP_MS);

            if (on === off) {
                skippedSame += 1;
                process.stderr.write(`${label}: 两臂逐字相同，跳过\n`);
                continue;
            }

            // 左右按段落长度定，可复跑；判官看不到这个字段
            const leftIsNew = (pairs.length + passage.text.length) % 2 === 0;
            pairs.push({
                id: pairs.length + 1,
                title: passage.title,
                text: passage.text,
                left: leftIsNew ? on : off,
                right: leftIsNew ? off : on,
                leftIsNew
            });
            process.stderr.write(`${label}: 已生成\n`);
        } catch (error) {
            process.stderr.write(`${label}: 失败 ${error.message}\n`);
            await sleep(GAP_MS * 2);
        }
    }

    process.stderr.write(
        `\n生成 ${pairs.length} 对（零命中跳过 ${skippedEmpty}，两臂相同跳过 ${skippedSame}）\n`
        + `左边是 ON 臂的有 ${pairs.filter(p => p.leftIsNew).length} 条\n`
    );
    process.stdout.write(JSON.stringify(pairs, null, 1));
}

await main();
