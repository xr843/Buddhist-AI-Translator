/*
 * 自动填充写本对译文的实际影响。
 *
 * 早先测过多本合参有效（「業」由 kriyā 纠正为 karman 等），但那是**手工准备**的
 * 写本；现在是 /fojin/witnesses 自动取回的，段落边界由 fojin 的 chunk 切分决定，
 * 不一定和汉文段落对齐。所以不能假定同样有效，必须重测。
 *
 * 三臂，只改写本与 focus 两项，其余（译风、术语库 context、目标语种）完全一致：
 *
 *   A  只送汉本                      —— 对照
 *   B  汉本 + 自动写本，focus=equal   —— **应用当前的实际行为**
 *   C  汉本 + 自动写本，focus=chinese —— 与 multiWitnessRule 的措辞一致
 *
 * B 与 C 的差别值得单独看：应用现在自动填了写本却仍用 focus=equal，
 * 而 multiWitnessRule 明说「汉本是底本，其他只用于消歧」——指令是自相矛盾的。
 *
 * 只出数据，不下判断。用法：
 *   node eval/witness-ab.mjs > eval/witness-ab.json
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = process.env.PROXY_URL || 'https://buddhist-translator-api.lqsxianren.workers.dev';
const ORIGIN = process.env.ALLOWED_ORIGIN || 'https://xr843.github.io';
const GAP_MS = Number(process.env.GAP_MS || 9000);
const WANT = Number(process.env.WANT || 4);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function post(pathname, payload) {
    const response = await fetch(`${PROXY}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`relay ${response.status}`);
    return response.json();
}

async function translate({ chinese, witnesses = {}, focus, context, styleInstruction }) {
    const data = await post('/mitra/translate', {
        input_chinese: chinese,
        input_sanskrit: witnesses.sa || '',
        input_tibetan: witnesses.bo || '',
        input_pali: witnesses.pi || '',
        context, focus,
        target_language: 'english',
        style_instruction: styleInstruction
    });
    if (typeof data?.translation !== 'string') throw new Error('unexpected payload');
    return data.translation.trim();
}

async function main() {
    const raw = JSON.parse(await readFile(path.join(repoRoot, 'src/data/lexicon.json'), 'utf8'));
    const lexicon = await import('../src/lexicon.js');
    lexicon.setLexicon(raw);

    const { buildStyleInstruction, defaultStyle, multiWitnessRule } = await import('../src/style.js');
    const soloInstruction = buildStyleInstruction(defaultStyle());
    const multiInstruction = [soloInstruction, multiWitnessRule(2)].join(' ');

    const passages = JSON.parse(await readFile(path.join(repoRoot, 'eval/passages.json'), 'utf8'));
    const results = [];

    for (const passage of passages) {
        if (results.length >= WANT) break;

        // 先看这一段能不能自动取回写本；取不到的段落对这个实验没有意义
        let witnessResult;
        try {
            witnessResult = await post('/fojin/witnesses', { text: passage.text });
        } catch (error) {
            process.stderr.write(`跳过 ${passage.title}: 取写本失败 ${error.message}\n`);
            await sleep(GAP_MS);
            continue;
        }
        await sleep(GAP_MS);

        if (!witnessResult?.found) {
            process.stderr.write(`跳过 ${passage.title}: ${witnessResult?.reason}\n`);
            continue;
        }

        const witnesses = witnessResult.witnesses || {};
        const context = lexicon.buildLexiconContext(passage.text, raw);
        const label = `${results.length + 1}/${WANT} ${passage.title}`;

        try {
            const soloOnly = await translate({
                chinese: passage.text, focus: 'equal', context, styleInstruction: soloInstruction
            });
            await sleep(GAP_MS);
            const equalFocus = await translate({
                chinese: passage.text, witnesses, focus: 'equal', context, styleInstruction: multiInstruction
            });
            await sleep(GAP_MS);
            const chineseFocus = await translate({
                chinese: passage.text, witnesses, focus: 'chinese', context, styleInstruction: multiInstruction
            });
            await sleep(GAP_MS);

            results.push({
                title: passage.title,
                text: passage.text,
                source: witnessResult.source,
                witnessLangs: Object.keys(witnesses),
                counts: witnessResult.counts,
                A_soloOnly: soloOnly,
                B_equalFocus: equalFocus,
                C_chineseFocus: chineseFocus
            });
            process.stderr.write(
                `${label}: 取到 ${Object.keys(witnesses).join('/')}；`
                + `B≠A ${equalFocus !== soloOnly}，C≠B ${chineseFocus !== equalFocus}\n`
            );
        } catch (error) {
            process.stderr.write(`${label}: 翻译失败 ${error.message}\n`);
            await sleep(GAP_MS * 2);
        }
    }

    process.stderr.write(`\n完成 ${results.length} 段\n`);
    process.stdout.write(JSON.stringify(results, null, 1));
}

await main();
