#!/usr/bin/env node
/**
 * build-lexicon.mjs — 从 Dharmamitra 词汇库构建汉语术语的实证对照索引。
 *
 * 上游数据：https://github.com/dharmamitra/dharmamitra-lexicon (CC BY 4.0)
 *   sa-zh/*.jsonl  梵→汉 的逐词/逐短语对照，反查得到「汉语术语 ← 梵文原语」
 *   zh-bo/*.jsonl  汉→藏 的逐词/逐短语对照，正查得到「汉语术语 → 藏译」
 *
 * 每条记录是一次真实出现（attested occurrence），不是人工编纂的词条，
 * 所以这里的做法是「按出现次数聚合 + 阈值过滤」，把高频稳定的对照留下来。
 *
 * 这是开发期一次性脚本，不进 npm run verify：上游数据 6.3 GB，需要先本地 clone。
 *
 *   git clone --depth 1 https://github.com/dharmamitra/dharmamitra-lexicon.git
 *   node scripts/build-lexicon.mjs --input /path/to/dharmamitra-lexicon
 *
 * 产物：src/data/lexicon.json（提交进仓库，前端按需懒加载）
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'src', 'data', 'lexicon.json');

// --- 过滤参数 ---------------------------------------------------------------
// 单个 (汉语词, 对译词) 组合至少出现这么多次才收录。低于这个数的多半是对齐噪声。
const MIN_PAIR_COUNT = 5;
// 一个汉语词在整个语料里的总出现次数下限。
const MIN_TERM_COUNT = 10;
// 每个汉语词最多保留几个梵文原语 / 藏译。
const MAX_SANSKRIT_PER_TERM = 4;
const MAX_TIBETAN_PER_TERM = 2;
// 藏文串很长，超过这个长度的不收（多半是整句而非词）。
const MAX_TIBETAN_LENGTH = 40;
// 汉语词长度范围。
const MAX_TERM_LENGTH = 8;
// 每个词最多记几个实证出处（大正藏经号）。
const MAX_WITNESSES_PER_TERM = 2;
/**
 * 必须有梵文原语才收录。这条过滤是实测定下来的，不是拍脑袋：
 * 随机抽样人工核对显示，只有藏译、没有梵文原语的一批里约七成是句法碎片
 * （「云何菩薩摩訶薩」「我所說」「佛土中」这类），而有梵文原语的一批约九成是真词项。
 * 代价是丢掉少量只对得上藏译的真术语（如「八正道」），这类由人工审定的
 * src/terms.json 兜底。
 */
const REQUIRE_SANSKRIT = true;
/**
 * 首选梵文原语必须占该词梵语侧出现总数的这个比例以上。
 * 句法碎片的对译是发散的（「又問」的首选 lemma 只占 2%），真词项是收敛的。
 */
const MIN_TOP_SANSKRIT_SHARE = 0.25;

/**
 * 单字词默认不收：汉文佛典里绝大多数单字是虚词（不、是、如、彼、於……），
 * 混进术语表只会污染送给模型的参考术语。下面这些是确实作为术语独立使用的单字，
 * 逐个人工核对过，其余单字一律排除。
 */
const SINGLE_CHAR_ALLOWLIST = new Set([
    '法', '空', '色', '識', '识', '蘊', '蕴', '業', '业', '苦', '慧', '定', '戒',
    '禪', '禅', '忍', '施', '覺', '觉', '智', '悲', '慈', '喜', '捨', '舍',
    '根', '界', '處', '处', '漏', '障', '果', '因', '緣', '缘', '相', '性',
    '見', '见', '愛', '爱', '取', '受', '想', '行', '觸', '触', '念', '信',
    '道', '諦', '谛', '乘', '願', '愿', '劫', '魔', '僧', '佛', '禮', '礼'
]);

const CJK = /^[一-鿿㐀-䶿]+$/;

function parseArgs(argv) {
    const args = { input: '', output: OUTPUT, limitFiles: 0 };
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i];
        if (flag === '--input') { args.input = argv[i + 1]; i += 1; }
        else if (flag === '--output') { args.output = argv[i + 1]; i += 1; }
        else if (flag === '--limit-files') { args.limitFiles = Number(argv[i + 1]); i += 1; }
        else if (flag === '-h' || flag === '--help') { args.help = true; }
        else { throw new Error(`未知参数: ${flag}`); }
    }
    return args;
}

export function isUsableTerm(term) {
    if (typeof term !== 'string') return false;
    const value = term.trim();
    if (!value || value.length > MAX_TERM_LENGTH) return false;
    if (!CJK.test(value)) return false;
    if (value.length === 1 && !SINGLE_CHAR_ALLOWLIST.has(value)) return false;
    return true;
}

/** ZH_T22_1425_036:0516a21_16 → T1425；认不出来就返回 null。 */
export function taishoIdFromSegment(segment) {
    if (typeof segment !== 'string') return null;
    const match = /^ZH_T\d{2}_(\d{4})/.exec(segment);
    return match ? `T${match[1]}` : null;
}

function firstSegment(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function bump(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
}

function topEntries(map, limit) {
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit);
}

async function* readRecords(dir, limitFiles) {
    let files;
    try {
        files = fs.readdirSync(dir).filter(name => name.endsWith('.jsonl')).sort();
    } catch {
        throw new Error(`读不到目录: ${dir}`);
    }
    if (limitFiles > 0) files = files.slice(0, limitFiles);
    for (const name of files) {
        const stream = fs.createReadStream(path.join(dir, name), { encoding: 'utf8' });
        const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of lines) {
            if (!line) continue;
            try {
                yield JSON.parse(line);
            } catch {
                // 单行坏了就跳过，不让整个构建挂掉
            }
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.input) {
        process.stdout.write(
            '用法: node scripts/build-lexicon.mjs --input <dharmamitra-lexicon 目录> [--output <路径>] [--limit-files N]\n'
        );
        process.exit(args.help ? 0 : 2);
    }

    // 汉语词 → { sa: Map, bo: Map, witnesses: Map, total: number }
    const terms = new Map();

    function entryFor(term) {
        let entry = terms.get(term);
        if (!entry) {
            entry = { sa: new Map(), bo: new Map(), witnesses: new Map(), nSa: 0, nBo: 0 };
            terms.set(term, entry);
        }
        return entry;
    }

    let saLines = 0;
    process.stderr.write('读 sa-zh（梵→汉，反查原语）…\n');
    for await (const rec of readRecords(path.join(args.input, 'sa-zh'), args.limitFiles)) {
        saLines += 1;
        const term = (rec.zh || '').trim();
        if (!isUsableTerm(term)) continue;
        const lemma = (rec.lemma || rec.head || '').trim();
        if (!lemma) continue;
        const entry = entryFor(term);
        entry.nSa += 1;
        bump(entry.sa, lemma);
        const taisho = taishoIdFromSegment(firstSegment(rec.tgt_segnr));
        if (taisho) bump(entry.witnesses, taisho);
    }

    let boLines = 0;
    process.stderr.write('读 zh-bo（汉→藏）…\n');
    for await (const rec of readRecords(path.join(args.input, 'zh-bo'), args.limitFiles)) {
        boLines += 1;
        const term = (rec.zh || rec.head || '').trim();
        if (!isUsableTerm(term)) continue;
        const tibetan = (rec.bo || '').trim();
        const entry = entryFor(term);
        entry.nBo += 1;
        if (tibetan && tibetan.length <= MAX_TIBETAN_LENGTH) bump(entry.bo, tibetan);
        const taisho = taishoIdFromSegment(firstSegment(rec.src_segnr));
        if (taisho) bump(entry.witnesses, taisho);
    }

    process.stderr.write('聚合并过滤…\n');
    const out = {};
    const dropped = { rare: 0, noSanskrit: 0, diffuse: 0 };
    let kept = 0;
    for (const [term, entry] of terms) {
        const total = entry.nSa + entry.nBo;
        if (total < MIN_TERM_COUNT) { dropped.rare += 1; continue; }

        const sa = topEntries(entry.sa, MAX_SANSKRIT_PER_TERM).filter(([, n]) => n >= MIN_PAIR_COUNT);
        if (REQUIRE_SANSKRIT && sa.length === 0) { dropped.noSanskrit += 1; continue; }

        // 首选原语过于发散 → 多半是句法碎片而非词项
        if (entry.nSa > 0 && sa.length > 0 && sa[0][1] / entry.nSa < MIN_TOP_SANSKRIT_SHARE) {
            dropped.diffuse += 1;
            continue;
        }

        const bo = topEntries(entry.bo, MAX_TIBETAN_PER_TERM).filter(([, n]) => n >= MIN_PAIR_COUNT);
        const witnesses = topEntries(entry.witnesses, MAX_WITNESSES_PER_TERM).map(([id]) => id);
        const record = { n: total };
        if (sa.length) record.sa = sa;
        if (bo.length) record.bo = bo;
        if (witnesses.length) record.src = witnesses;
        out[term] = record;
        kept += 1;
    }

    const payload = {
        meta: {
            name: '汉语佛典术语实证对照索引',
            derivedFrom: 'dharmamitra-lexicon',
            upstream: 'https://github.com/dharmamitra/dharmamitra-lexicon',
            upstreamCommit: '2b327f3453fb1d273ed00f367aac1c83a5c962b1',
            license: 'CC BY 4.0',
            attribution: 'Dharmamitra project (MITRA, Tohoku University)',
            note: '每个词条由平行语料中真实出现的对译片段聚合而成，未经人工逐条审定；n 为出现次数，src 为大正藏经号。',
            // 2026-08-14 抽样核验：固定种子随机取 40 条逐条人工判读，
            // 5 条是句法碎片而非词项（麁等 / 住中 / 名菩薩 / 心平等 / 象等），精确率 87.5%。
            // 复现：node scripts/build-lexicon.mjs 后按 docs/lexicon.md 的方法重抽。
            sampledPrecision: { sample: 40, wrong: 5, date: '2026-08-14' },
            filters: {
                minPairCount: MIN_PAIR_COUNT,
                minTermCount: MIN_TERM_COUNT,
                maxSanskritPerTerm: MAX_SANSKRIT_PER_TERM,
                maxTibetanPerTerm: MAX_TIBETAN_PER_TERM,
                maxTermLength: MAX_TERM_LENGTH,
                singleCharAllowlist: SINGLE_CHAR_ALLOWLIST.size,
                requireSanskrit: REQUIRE_SANSKRIT,
                minTopSanskritShare: MIN_TOP_SANSKRIT_SHARE
            },
            entries: kept
        },
        entries: out
    };

    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, `${JSON.stringify(payload)}\n`, 'utf8');

    const bytes = fs.statSync(args.output).size;
    process.stderr.write(
        `sa-zh 行数 ${saLines.toLocaleString()} / zh-bo 行数 ${boLines.toLocaleString()}\n`
        + `候选词 ${terms.size.toLocaleString()} → 收录 ${kept.toLocaleString()}\n`
        + `剔除：出现太少 ${dropped.rare.toLocaleString()}、`
        + `无梵文原语 ${dropped.noSanskrit.toLocaleString()}、`
        + `原语发散 ${dropped.diffuse.toLocaleString()}\n`
        + `写入 ${args.output} (${(bytes / 1024).toFixed(0)} KB)\n`
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
    });
}
