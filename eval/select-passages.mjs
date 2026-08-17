/*
 * 为「术语库到底改不改译词」这个问题挑有鉴别力的样本。
 *
 * 背景：2026-08-15 随机抽 4 段做的对照得出「术语库不改英文选词」的结论，
 * 但随机样本没有鉴别力——多数段落 MITRA 本来就译对了，术语库无从体现。
 * 这个脚本挑的是**术语库密集命中、且命中词本身有歧义**的段落：
 * 词条里给出多个不同梵文对应（说明该汉词在语料中确实对译不一），
 * 这类词最有可能出现「模型默认选 A、术语库主张 B」的分歧。
 *
 * 只做选段，不下判断，也不打任何接口。用法：
 *   node eval/select-passages.mjs > eval/passages.json
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// CBETA P5 全文的本地路径。不在仓库里——它是另一个项目的只读资产。
const CBETA = process.env.CBETA_DIR
    || '/home/lqsxi/projects/hanzhu-align/xml-p5';

// 取几部有代表性、且体裁不同的经论，避免全挑一部导致结论只对一种文体成立
const SOURCES = [
    ['T/T02/T02n0099.xml', '雜阿含經'],
    ['T/T30/T30n1579.xml', '瑜伽師地論'],
    ['T/T29/T29n1558.xml', '阿毘達磨俱舍論'],
    ['T/T25/T25n1509.xml', '大智度論'],
    ['T/T31/T31n1585.xml', '成唯識論']
];

const MIN_CHARS = 80;
const MAX_CHARS = 190;
const WANT = Number(process.env.WANT || 15);
const PER_SOURCE = Number(process.env.PER_SOURCE || Math.max(4, Math.ceil(WANT / 5)));

function stripMarkup(xml) {
    return xml
        .replace(/<note[\s\S]*?<\/note>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, '');
}

/** 从一部经里抽出长度合适的段落。取中后段，避开卷首套语。 */
async function passagesFrom(relativePath, title) {
    const xml = await readFile(path.join(CBETA, relativePath), 'utf8');
    const body = xml.slice(xml.indexOf('<body>'), xml.lastIndexOf('</body>'));
    const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
        .map(match => stripMarkup(match[1]))
        .filter(text => text.length >= MIN_CHARS && text.length <= MAX_CHARS)
        .filter(text => !/[0-9０-９]/.test(text));

    // 只取中后段
    const start = Math.floor(paragraphs.length / 3);
    return paragraphs.slice(start, Math.floor(paragraphs.length * 0.85))
        .map(text => ({ title, text }));
}

/*
 * 结构性虚词。它们命中率极高但没有教义分量，模型怎么译都不会错到哪去，
 * 留在打分里只会把所有段落拉平。
 */
const STOPWORDS = new Set([
    '如是', '乃至', '所以', '若有', '爾時', '云何', '何等', '是名', '當知', '應知',
    '復次', '一切', '有情', '眾生', '菩薩', '諸佛', '世尊', '比丘', '我今', '汝等',
    '如前', '廣說', '此中', '彼彼', '如此', '若於'
]);

/**
 * 鉴别力打分。
 *
 * ⚠️ buildLexiconContext 的 maxTerms 上限是 12，所以「命中条数」在密集段落上
 * 会全部顶格、失去区分度——第一版脚本就栽在这里，4,140 段里 4,103 段都过了
 * 「命中≥6」的筛子，选出来的 15 段分数一模一样。
 *
 * 现在只让**非虚词、且梵文对应分散**的词条参与打分：对应越分散，说明该汉词在
 * 平行语料里对译越不一致，也就越可能出现「模型默认选 A、术语库主张 B」的分歧。
 * 这才是有鉴别力的地方。
 */
function discriminationScore(context) {
    const lines = context.split('\n').filter(line => line.startsWith('- '));
    let score = 0;

    for (const line of lines) {
        const term = (line.slice(2).split('=')[0] || '').trim();
        if (STOPWORDS.has(term)) continue;

        const options = (line.split('=')[1] || '').split('/').map(s => s.trim()).filter(Boolean);
        const distinct = new Set(options.map(o => o.toLowerCase())).size;
        // 只有一两个对应的词条没有分歧空间
        if (distinct >= 3) score += distinct * Math.min(term.length, 4);
    }

    return score;
}

async function main() {
    // lexicon.js 走浏览器的 fetch，这里用本地文件顶上
    const raw = JSON.parse(await readFile(path.join(repoRoot, 'src/data/lexicon.json'), 'utf8'));
    globalThis.fetch = async () => ({ ok: true, json: async () => raw });

    const { loadLexicon, buildLexiconContext } = await import('../src/lexicon.js');
    const lexicon = await loadLexicon();

    const candidates = [];
    for (const [relativePath, title] of SOURCES) {
        try {
            candidates.push(...await passagesFrom(relativePath, title));
        } catch (error) {
            process.stderr.write(`跳过 ${title}: ${error.message}\n`);
        }
    }

    const scored = candidates
        .map(candidate => {
            const context = buildLexiconContext(candidate.text, lexicon);
            const hits = context ? context.split('\n').length - 1 : 0;
            return { ...candidate, context, hits, score: discriminationScore(context) };
        })
        .filter(candidate => candidate.hits >= 6)
        .sort((a, b) => b.score - a.score);

    // 每部经最多取这么多段，避免结论被单一文体主导。
    // ⚠️ 上限乘经数就是硬天花板：5 部 × 4 = 20，WANT 再大也没用。
    // 2026-08-17 扩池时就撞上了这个，第一次跑 WANT=40 只出 20 段。
    const perTitle = new Map();
    const picked = [];
    for (const candidate of scored) {
        const used = perTitle.get(candidate.title) || 0;
        if (used >= PER_SOURCE) continue;
        perTitle.set(candidate.title, used + 1);
        picked.push(candidate);
        if (picked.length >= WANT) break;
    }

    process.stderr.write(
        `候选 ${candidates.length} 段 → 命中≥6 的 ${scored.length} 段 → 选中 ${picked.length} 段\n`
        + [...perTitle].map(([t, n]) => `  ${t}: ${n}`).join('\n') + '\n'
    );

    process.stdout.write(JSON.stringify(picked, null, 1));
}

await main();
