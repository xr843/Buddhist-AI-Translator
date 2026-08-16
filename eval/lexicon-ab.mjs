/*
 * 术语库 A/B：注入 vs 不注入，其余一切相同。
 *
 * 回答的问题：`src/data/lexicon.json` 到底改不改**英文选词**，
 * 还是只会给译文加梵文括注。
 *
 * 关键设计：译风固定为 termRendering='translate'（意译优先、不附原语）。
 * 在这个模式下，如果术语库只会加括注，它就该毫无影响——
 * **任何差异都必然发生在选词上**。这是整个实验的鉴别力所在，别改。
 *
 * 只出数据与差异，不下判断。人工看 diff 才算数。
 *
 * 用法：
 *   node eval/select-passages.mjs > eval/passages.json
 *   PROXY_URL=https://…workers.dev node eval/lexicon-ab.mjs > eval/lexicon-ab.json
 *
 * ⚠️ 上游约 10 次请求/分钟就回 429，且不带 Retry-After。
 * 每次请求之间的间隔别往下调——那是别人的免费接口。
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
    const { buildStyleInstruction } = await import('../src/style.js');
    // 两臂共用同一条指令。译风一旦不同，测出来的就不是术语库了。
    const styleInstruction = buildStyleInstruction({ termRendering: 'translate' });

    const passages = JSON.parse(await readFile(path.join(repoRoot, 'eval/passages.json'), 'utf8'));
    const results = [];

    for (const [index, passage] of passages.entries()) {
        const label = `${index + 1}/${passages.length} ${passage.title}`;
        try {
            const without = await translate(passage.text, '', styleInstruction);
            await sleep(GAP_MS);
            const with_ = await translate(passage.text, passage.context, styleInstruction);
            await sleep(GAP_MS);

            results.push({
                title: passage.title,
                score: passage.score,
                text: passage.text,
                without,
                with: with_,
                identical: without === with_
            });
            process.stderr.write(`${label}: ${without === with_ ? '两臂完全相同' : '有差异'}\n`);
        } catch (error) {
            process.stderr.write(`${label}: 失败 ${error.message}\n`);
            results.push({ title: passage.title, score: passage.score, text: passage.text, error: error.message });
            await sleep(GAP_MS * 2);
        }
    }

    const done = results.filter(r => !r.error);
    const identical = done.filter(r => r.identical).length;
    process.stderr.write(`\n完成 ${done.length}/${results.length}；两臂逐字相同 ${identical} 段\n`);

    process.stdout.write(JSON.stringify(results, null, 1));
}

await main();
