#!/usr/bin/env node
/**
 * 术语漂移判读 —— 只出数字与候选，不下判断。
 *
 *   node eval/drift-check.mjs --terms eval/corpus/佛遺教經.terms.json \
 *        --a eval/out/佛遺教經.with-context.md --b eval/out/佛遺教經.no-context.md
 *
 * ⚠️ 这个脚本**不知道**「比丘」在译文里对应哪个词。它做的是：
 * 找出所有含该术语的块，看它们的译文里哪些词覆盖率最高，把候选摆出来。
 * 覆盖率 1.0 意味着某个词在每一处都出现 —— 强烈提示译法一致；
 * 低于 1.0 可能是漂移，也可能是该术语这次被意译进句子里了。**必须人工看一眼。**
 *
 * 之所以要 A/B 两份，是因为单看一份没有基准：只有「同一部经、同一引擎、
 * 同一译风，只改回喂上文这一个变量」的对照，才谈得上滚动上下文起没起作用。
 */

import fs from 'node:fs';
import path from 'node:path';

const STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'and', 'to', 'in', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'that', 'this', 'these', 'those', 'it', 'its', 'as', 'for', 'with', 'by', 'on', 'at', 'from',
    'or', 'not', 'no', 'they', 'them', 'their', 'you', 'your', 'he', 'his', 'she', 'her', 'we',
    'our', 'i', 'my', 'if', 'then', 'so', 'but', 'all', 'any', 'who', 'which', 'what', 'when',
    'there', 'here', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
    'can', 'could', 'may', 'might', 'must', 'one', 'such', 'thus', 'like', 'into', 'upon', 'about'
]);

// 拉丁字母（含变音符号），排除汉字
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ſǍ-ǰḀ-ỿ][A-Za-zÀ-ÖØ-öø-ÿĀ-ſǍ-ǰḀ-ỿ'’-]*/gu;

function parseArgs(argv) {
    const args = { terms: '', a: '', b: '' };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--terms') args.terms = argv[++i];
        else if (argv[i] === '--a') args.a = argv[++i];
        else if (argv[i] === '--b') args.b = argv[++i];
        else throw new Error(`未知参数: ${argv[i]}`);
    }
    if (!args.terms || !args.a) throw new Error('至少要给 --terms 与 --a');
    return args;
}

/** 解析 renderDocumentMarkdown 产出的对照稿：## N / ``` 原文 ``` / 译文 */
export function parseTranslationMarkdown(markdown) {
    const chunks = [];
    const sections = markdown.split(/^## \d+\s*$/m).slice(1);
    for (const section of sections) {
        const fence = section.match(/```\n([\s\S]*?)\n```/);
        if (!fence) continue;
        const source = fence[1].trim();
        const translation = section.slice(section.indexOf(fence[0]) + fence[0].length).trim();
        chunks.push({ source, translation });
    }
    return chunks;
}

function words(text) {
    return (text.match(WORD) || [])
        .map(word => word.toLowerCase())
        .filter(word => word.length >= 3 && !STOPWORDS.has(word));
}

/**
 * 对一个术语，算出各候选词在「含该术语的块」里的覆盖率。
 * @returns {{ occurrences:number, candidates:Array<[string,number]>, topCoverage:number }}
 */
export function analyseTerm(term, chunks) {
    const hits = chunks.filter(chunk => chunk.source.includes(term));
    if (hits.length === 0) return { occurrences: 0, candidates: [], topCoverage: null };

    const counts = new Map();
    for (const hit of hits) {
        for (const word of new Set(words(hit.translation))) {
            counts.set(word, (counts.get(word) || 0) + 1);
        }
    }

    const ranked = [...counts.entries()]
        .map(([word, n]) => [word, n / hits.length])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    // 覆盖率过半的算「像是这个术语的译法」；一个都没有时也要把前几名摆出来，
    // 否则人只看到一行「⚠️ 比丘 4块」，根本不知道它漂成了什么
    const candidates = ranked.filter(([, coverage]) => coverage >= 0.5).slice(0, 5);
    const fallback = candidates.length > 0 ? [] : ranked.slice(0, 5);

    return {
        occurrences: hits.length,
        candidates,
        fallback,
        topCoverage: candidates.length > 0 ? candidates[0][1] : 0
    };
}

function summarise(label, terms, chunks) {
    const rows = [];
    for (const entry of terms) {
        const analysis = analyseTerm(entry.term, chunks);
        if (analysis.occurrences < 2) continue;
        rows.push({ term: entry.term, ...analysis });
    }
    const covered = rows.filter(row => row.topCoverage === 1).length;
    const mean = rows.length > 0
        ? rows.reduce((sum, row) => sum + row.topCoverage, 0) / rows.length
        : 0;
    return { label, rows, covered, total: rows.length, mean };
}

function printReport(report) {
    process.stdout.write(`\n===== ${report.label} =====\n`);
    process.stdout.write(
        `覆盖率 1.0 的术语：${report.covered}/${report.total}`
        + `　平均首选覆盖率：${report.mean.toFixed(3)}\n\n`
    );
    for (const row of report.rows.sort((a, b) => a.topCoverage - b.topCoverage)) {
        const candidates = row.candidates.length > 0
            ? row.candidates.map(([word, coverage]) => `${word}(${coverage.toFixed(2)})`).join(' ')
            : `无过半候选 → ${row.fallback.map(([word, c]) => `${word}(${c.toFixed(2)})`).join(' ')}`;
        const flag = row.topCoverage < 1 ? '⚠️' : '  ';
        process.stdout.write(
            `${flag} ${row.term.padEnd(8)} ${String(row.occurrences).padStart(2)}块  ${candidates}\n`
        );
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const terms = JSON.parse(fs.readFileSync(args.terms, 'utf8')).entries;

    const reportA = summarise(
        path.basename(args.a),
        terms,
        parseTranslationMarkdown(fs.readFileSync(args.a, 'utf8'))
    );
    printReport(reportA);

    if (!args.b) {
        process.stdout.write('\n（只给了一份译文，没有对照 —— 上面的数字无从判断好坏。）\n');
        return;
    }

    const reportB = summarise(
        path.basename(args.b),
        terms,
        parseTranslationMarkdown(fs.readFileSync(args.b, 'utf8'))
    );
    printReport(reportB);

    process.stdout.write('\n===== 对照 =====\n');
    process.stdout.write(
        `${reportA.label}: 一致 ${reportA.covered}/${reportA.total}，均值 ${reportA.mean.toFixed(3)}\n`
        + `${reportB.label}: 一致 ${reportB.covered}/${reportB.total}，均值 ${reportB.mean.toFixed(3)}\n`
        + `差值：一致术语 ${reportA.covered - reportB.covered} 条，均值 ${(reportA.mean - reportB.mean).toFixed(3)}\n`
    );
    process.stdout.write(
        '\n注意：这只是覆盖率统计，不是漂移的定义。'
        + '标 ⚠️ 的术语需要人工看译文，判断是真漂移还是合理的行文变化。\n'
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
