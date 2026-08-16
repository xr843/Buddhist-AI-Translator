/*
 * 只重跑「注入术语库」这一臂，与 eval/lexicon-ab.json 里存着的上一轮结果对照。
 *
 * 为什么不整轮重跑：「不注入」那一臂与术语库无关，上游又是确定性解码
 * （同输入连跑三次逐字节一致，见 README），重跑只是白花上游的配额。
 * 存量结果就是合格的对照组。
 *
 * 用法：
 *   node eval/rerun-with-arm.mjs > eval/lexicon-ab-v2.json
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = process.env.PROXY_URL || 'https://buddhist-translator-api.lqsxianren.workers.dev';
const ORIGIN = process.env.ALLOWED_ORIGIN || 'https://xr843.github.io';
const GAP_MS = Number(process.env.GAP_MS || 8000);

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
    const raw = JSON.parse(await readFile(path.join(repoRoot, 'src/data/lexicon.json'), 'utf8'));
    globalThis.fetch = globalThis.fetch; // 保留真实 fetch，下面只替换 lexicon 的加载
    const lexiconModule = await import('../src/lexicon.js');
    lexiconModule.setLexicon(raw);

    const { buildStyleInstruction } = await import('../src/style.js');
    const styleInstruction = buildStyleInstruction({ termRendering: 'translate' });

    const previous = JSON.parse(await readFile(path.join(repoRoot, 'eval/lexicon-ab.json'), 'utf8'));
    const passages = JSON.parse(await readFile(path.join(repoRoot, 'eval/passages.json'), 'utf8'));

    const results = [];
    for (const [index, passage] of passages.entries()) {
        const before = previous[index] || {};
        // 用**当前**匹配器重新生成 context，这正是本轮唯一改变的东西
        const context = lexiconModule.buildLexiconContext(passage.text, raw);

        try {
            const withNew = await translate(passage.text, context, styleInstruction);
            await sleep(GAP_MS);

            results.push({
                title: passage.title,
                text: passage.text,
                contextBefore: before.contextUsed ?? passage.context,
                contextAfter: context,
                without: before.without,          // 对照组沿用上一轮（上游确定性解码）
                withOld: before.with,
                withNew,
                contextChanged: (passage.context || '') !== context,
                outputChanged: before.with !== withNew
            });
            process.stderr.write(
                `${index + 1}/${passages.length} ${passage.title}: `
                + `context ${(passage.context || '') !== context ? '变了' : '未变'}，`
                + `译文 ${before.with !== withNew ? '变了' : '未变'}\n`
            );
        } catch (error) {
            process.stderr.write(`${index + 1}/${passages.length} 失败 ${error.message}\n`);
            results.push({ title: passage.title, text: passage.text, error: error.message });
            await sleep(GAP_MS * 2);
        }
    }

    const done = results.filter(r => !r.error);
    process.stderr.write(
        `\n完成 ${done.length}/${results.length}；`
        + `context 变化 ${done.filter(r => r.contextChanged).length} 段，`
        + `译文变化 ${done.filter(r => r.outputChanged).length} 段\n`
    );

    process.stdout.write(JSON.stringify(results, null, 1));
}

await main();
