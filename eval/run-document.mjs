#!/usr/bin/env node
/**
 * 整部经翻译的验收跑批。
 *
 * 只做一件事：把同一部经跑两遍，**只改「回喂已译上文」这一个变量**，
 * 其余（引擎、译风、切块、术语表）全部相同。这样才谈得上「滚动上下文起没起作用」，
 * 否则只是看一眼译文觉得还行。
 *
 *   node eval/run-document.mjs --corpus eval/corpus/佛遺教經.zh.txt --out eval/out
 *   node eval/run-document.mjs --corpus ... --no-context --out eval/out
 *
 * Node 直连 dharmamitra 不受那个重复 CORS 头影响（那是浏览器才检查的），
 * 所以这个脚本不需要 Worker 中转。
 *
 * ⚠️ 在走代理的机器上要加 `NODE_USE_ENV_PROXY=1` —— Node 的 fetch 默认不读
 * http_proxy/https_proxy 环境变量，curl 读，所以会出现「curl 通、脚本不通」。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRollingContext, chunkDocument, renderDocumentMarkdown } from '../src/document.js';
import { buildLexiconContext, setLexicon } from '../src/lexicon.js';
import { buildStyleInstruction, defaultStyle, describeStyle } from '../src/style.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://dharmamitra.org/api-search/cat-translate/v1/translate';
// 实测 2026-08-15：约 10 次请求后上游开始回 429，且不带 Retry-After，约 80 秒恢复。
// 这里按 ~9 次/分钟走，宁可慢也别把人家的免费接口打到限流。
const DELAY_MS = 6500;
// 撞上 429 就长等，退避递增
const RETRY_BASE_MS = 30000;

function parseArgs(argv) {
    const args = { corpus: '', out: 'eval/out', withContext: true, target: 'english', label: '' };
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i];
        if (flag === '--corpus') { args.corpus = argv[++i]; }
        else if (flag === '--out') { args.out = argv[++i]; }
        else if (flag === '--target') { args.target = argv[++i]; }
        else if (flag === '--label') { args.label = argv[++i]; }
        else if (flag === '--no-context') { args.withContext = false; }
        else throw new Error(`未知参数: ${flag}`);
    }
    if (!args.corpus) throw new Error('必须给 --corpus');
    if (!args.label) args.label = args.withContext ? 'with-context' : 'no-context';
    return args;
}

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

async function callMitra(chineseText, context, styleInstruction, target) {
    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input_tibetan: '',
            input_chinese: chineseText,
            input_pali: '',
            input_sanskrit: '',
            context,
            focus: 'chinese',
            target_language: target,
            style_instruction: styleInstruction
        })
    });
    if (!response.ok) throw new Error(`MITRA ${response.status}`);
    const data = await response.json();
    const translation = typeof data?.translation === 'string' ? data.translation.trim() : '';
    if (!translation) throw new Error('空译文');
    return translation;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const corpusPath = path.resolve(ROOT, args.corpus);
    const text = fs.readFileSync(corpusPath, 'utf8');
    setLexicon(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lexicon.json'), 'utf8')));

    const style = defaultStyle();
    const styleInstruction = buildStyleInstruction(style);
    const chunks = chunkDocument(text);

    process.stderr.write(
        `《${path.basename(corpusPath).split('.')[0]}》${text.length} 字 → ${chunks.length} 块\n`
        + `目标语言 ${args.target}／译风 ${describeStyle(style)}／`
        + `滚动上下文 ${args.withContext ? '开' : '关'}\n`
    );

    const entries = [];
    for (const chunk of chunks) {
        // 唯一的变量：关掉时不回喂已译上文，其余（术语表、语体）两边一模一样
        const context = buildRollingContext({
            priorTranslations: args.withContext ? entries.map(e => e.translation) : [],
            glossary: buildLexiconContext(chunk.text, undefined, { maxTerms: 8 }),
            registerReminder: describeStyle(style)
        });

        let translation;
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            try {
                translation = await callMitra(chunk.text, context, styleInstruction, args.target);
                break;
            } catch (error) {
                if (attempt === 5) {
                    const proxied = process.env.https_proxy || process.env.HTTPS_PROXY;
                    const hint = proxied && !process.env.NODE_USE_ENV_PROXY
                        ? '（这台机器设了 https_proxy，但 Node 的 fetch 默认不读它。'
                          + '在命令前加 NODE_USE_ENV_PROXY=1 再试。）'
                        : '';
                    throw new Error(`第 ${chunk.index + 1} 块失败: ${error.message}${hint}`);
                }
                const rateLimited = /\b429\b/.test(error.message);
                process.stderr.write(`\n  第 ${chunk.index + 1} 块 ${error.message}，等待重试 ${attempt}/4\n`);
                await sleep(rateLimited ? RETRY_BASE_MS * attempt : 3000 * attempt);
            }
        }

        entries.push({ chunk, translation, context });
        process.stderr.write(`  ${chunk.index + 1}/${chunks.length}\r`);
        await sleep(DELAY_MS);
    }
    process.stderr.write('\n');

    const outDir = path.resolve(ROOT, args.out);
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.join(outDir, `${path.basename(corpusPath).split('.')[0]}.${args.label}`);

    fs.writeFileSync(`${base}.md`, renderDocumentMarkdown(entries, {
        title: `${path.basename(corpusPath).split('.')[0]}（${args.label}）`,
        engine: 'MITRA cat-translate',
        style: describeStyle(style)
    }), 'utf8');

    // context 也留档，好复核「回喂」这件事到底发生了没有
    fs.writeFileSync(`${base}.contexts.json`, JSON.stringify(
        entries.map(e => ({ index: e.chunk.index, source: e.chunk.text, context: e.context })),
        null,
        1
    ), 'utf8');

    process.stderr.write(`写入 ${base}.md\n`);
}

main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
});
