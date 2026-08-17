/*
 * 文档里用反引号写出来的路径，必须真实存在。
 *
 * 这个毛病犯过两次了：
 *   第一次 —— `eval/` 目录只存在于本地、从未提交，而 CLAUDE.md 一直引用着里面的
 *             `drift-check.mjs` 与 `RESULTS.md`。教训写在 eval/README.md 开头。
 *   第二次 —— 2026-08-17 核查分支保护时顺手发现：整部经模式（PR #76）从没合并，
 *             `src/document.js`、`docs/document-mode.md`、`eval/run-document.mjs`
 *             全都不在 master，`index.html` 里也没有入口，
 *             但 CLAUDE.md 与 NOTICE.md 都在描述它，像是已有功能。
 *             那天我甚至往 NOTICE.md 那句话后面追加了内容 —— 编辑了一句
 *             描述不存在功能的话，而没有察觉。
 *
 * CLAUDE.md 是每个会话开工第一页，它写错的东西会被当成事实照着做。
 * 所以这条闸门盯着它，以及对外的 README / NOTICE。
 *
 * 只查**看起来像仓库内路径**的反引号内容：带 `/` 或带已知扩展名。
 * `MIN_INTERVAL_MS`、`useLexicon`、`npm run verify` 之类不在此列 ——
 * 闸门过宽会制造误报，误报多了就没人当真，等于没有闸门。
 *
 * 允许「明确标注为未合并/不存在」的引用：那正是我们希望的写法，
 * 不能因为写清楚了反而被判违规。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access, readdir } from 'node:fs/promises';

const DOCS = ['CLAUDE.md', 'NOTICE.md', 'README.md', 'docs/lexicon.md', 'eval/README.md'];

/** 带斜杠，或带这些扩展名，才当成仓库内路径。 */
const PATH_SHAPE = /^(?:[\w.@-]+\/)+[\w.@-]+$|^[\w.@-]+\.(?:mjs|js|json|md|css|html|toml|yml|yaml)$/;

/** 明显不是仓库内路径的：URL、命令、npm 包名、通配符。 */
function looksExternal(candidate) {
    return /^https?:|^\.{1,2}\//.test(candidate)
        || /\s/.test(candidate)
        || /[*?<>]/.test(candidate)
        || candidate.startsWith('@')
        || candidate.startsWith('~');
}

/*
 * 附近说了「未合并 / 不在 master / 不存在 / 上游」的引用放行。
 *
 * 「未合并」这类标注正是发现问题后该有的写法，不能反过来罚它。
 * 「上游」是另一回事：`v1/README.md`、`v2/LICENSE` 这些指的是 dharmamitra
 * 仓库里的文件，不在本仓库，本来就不该存在于此。
 * 「404 / 没有」则是 NOTICE 在**记录某个路径不存在**——那是核查结论，不是笔误。
 */
const EXCUSED = /未合并|不在 master|不存在|尚未|从未提交|PR #\d+|未使用|not merged|does not exist|上游|upstream|404|没有/;

/*
 * 豁免以**段落**为界，不是按行数往前数。
 *
 * 第一版按「往前看 3 行」，结果 CLAUDE.md 里一处 `meta.json` 被两行之外、
 * 且隔着空行的另一段里的「PR #76」豁免掉了 —— 闸门放过了一个真问题。
 * 按行数数会跨段泄漏；按段落算，一段警示覆盖它自己列出的路径，到空行为止。
 */
function paragraphOf(lines, index) {
    let start = index;
    while (start > 0 && lines[start - 1].trim() !== '') start -= 1;
    let end = index;
    while (end < lines.length - 1 && lines[end + 1].trim() !== '') end += 1;
    return lines.slice(start, end + 1).join('\n');
}

async function exists(path) {
    try {
        await access(new URL(`../${path}`, import.meta.url));
        return true;
    } catch {
        return false;
    }
}

/*
 * 光秃秃的基名（`lexicon.json`、`terms.json`）在正文里几乎都是简称，
 * 指的是 `src/data/lexicon.json` 这种实际路径。所以对不带斜杠的候选，
 * 只在**全仓库都找不到同名文件**时才算违规。
 * 这样既放过简称，又抓得住 `styles.css` 这种「文件真的没了」的情况。
 */
const IGNORED_DIRS = new Set(['node_modules', '.git', '.github', 'out']);

async function collectBasenames(dir, into) {
    const entries = await readdir(new URL(dir, import.meta.url), { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRS.has(entry.name)) continue;
            await collectBasenames(`${dir}${entry.name}/`, into);
        } else {
            into.add(entry.name);
        }
    }
    return into;
}

test('every repo path quoted in the docs actually exists', async () => {
    const missing = [];
    const basenames = await collectBasenames('../', new Set());

    for (const doc of DOCS) {
        let text;
        try {
            text = await readFile(new URL(`../${doc}`, import.meta.url), 'utf8');
        } catch {
            missing.push(`${doc} —— 文档本身不存在`);
            continue;
        }

        // 逐行处理，这样才能判断「这一行有没有标注未合并」
        const lines = text.split('\n');
        let inFence = false;

        for (const [index, line] of lines.entries()) {
            if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
            if (inFence) continue;                      // 代码块里的示例路径不算引用

            if (EXCUSED.test(paragraphOf(lines, index))) continue;

            for (const match of line.matchAll(/`([^`\n]{2,80})`/g)) {
                const candidate = match[1].trim().replace(/[,，。;；:：)）]+$/, '');
                if (looksExternal(candidate) || !PATH_SHAPE.test(candidate)) continue;

                if (candidate.includes('/')) {
                    if (!(await exists(candidate))) {
                        missing.push(`${doc}:${index + 1} 引用了不存在的 \`${candidate}\``);
                    }
                } else if (!basenames.has(candidate)) {
                    missing.push(`${doc}:${index + 1} 引用了仓库里找不到的 \`${candidate}\``);
                }
            }
        }
    }

    assert.deepEqual(
        missing,
        [],
        '文档引用了仓库里没有的文件。要么把文件合进来，要么在同一行注明它未合并：\n  '
        + missing.join('\n  ')
    );
});
