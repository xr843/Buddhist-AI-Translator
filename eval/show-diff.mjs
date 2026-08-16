/*
 * 把 lexicon-ab.json 的两臂差异摆出来，供人工判断。
 *
 * 只做三件事：统计有多少段两臂逐字相同；对有差异的段落列出被替换掉的词；
 * 标出这些差异里有多少确实落在术语库主张的词上。
 *
 * **不判断哪边更好**——那要人看。见 eval/README.md。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 按词切开，保留大小写与变音符号；标点单独成词，避免把 "form," 和 "form" 当成两个词。 */
function tokenize(text) {
    return text.match(/[\p{L}\p{M}'’-]+|[^\s\p{L}\p{M}]/gu) || [];
}

/** 最长公共子序列，用来找出真正被替换的片段而不是整句重排。 */
function diffSpans(a, b) {
    const n = a.length;
    const m = b.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }

    const spans = [];
    let i = 0;
    let j = 0;
    let removed = [];
    let added = [];

    const flush = () => {
        if (removed.length || added.length) spans.push({ removed, added });
        removed = [];
        added = [];
    };

    while (i < n && j < m) {
        if (a[i] === b[j]) {
            flush();
            i += 1;
            j += 1;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            removed.push(a[i]);
            i += 1;
        } else {
            added.push(b[j]);
            j += 1;
        }
    }

    removed.push(...a.slice(i));
    added.push(...b.slice(j));
    flush();

    return spans.filter(span => span.removed.length || span.added.length);
}

const results = JSON.parse(await readFile(path.join(repoRoot, 'eval/lexicon-ab.json'), 'utf8'));
const done = results.filter(entry => !entry.error);
const identical = done.filter(entry => entry.identical);

console.log(`完成 ${done.length}/${results.length} 段；两臂逐字相同 ${identical.length} 段，有差异 ${done.length - identical.length} 段\n`);

for (const [index, entry] of done.entries()) {
    if (entry.identical) continue;

    const spans = diffSpans(tokenize(entry.without), tokenize(entry.with));
    const meaningful = spans.filter(span =>
        span.removed.some(word => /\p{L}/u.test(word)) || span.added.some(word => /\p{L}/u.test(word)));

    console.log(`── ${index + 1}. ${entry.title}（鉴别力 ${entry.score}）差异 ${meaningful.length} 处`);
    console.log(`   ${entry.text.slice(0, 46)}`);

    for (const span of meaningful.slice(0, 8)) {
        const before = span.removed.join(' ') || '（无）';
        const after = span.added.join(' ') || '（删去）';
        console.log(`     无术语库: ${before}`);
        console.log(`     有术语库: ${after}`);
    }
    console.log();
}
