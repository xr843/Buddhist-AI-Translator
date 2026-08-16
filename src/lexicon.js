/**
 * 实证对照索引 —— 汉语佛典术语 → 梵文原语 / 藏译。
 *
 * 数据来自 Dharmamitra 的 dharmamitra-lexicon（CC BY 4.0），由平行语料中真实
 * 出现的对译片段聚合而成，构建过程见 scripts/build-lexicon.mjs。
 * 它跟 src/terms.json 是两层：terms.json 是人工审定、带解释的核心表；
 * 这里是机器挖掘、带出现次数与出处的广度表，未经逐条审定。
 *
 * 文件 800 KB 上下，所以按需加载，不进首屏。
 */

const LEXICON_URL = './src/data/lexicon.json';

// 索引里最长的词条长度，扫描窗口按它取上界。
const MAX_TERM_LENGTH = 8;

/**
 * 送进模型的参考术语只取有梵文原语的词条。
 * 构建脚本里已经按这条过滤过一轮，这里再挡一次，是因为词条也可能只带藏译。
 */
const MIN_TERM_LENGTH_FOR_CONTEXT = 2;

let cache = null;
let inflight = null;

export function resetLexicon() {
    cache = null;
    inflight = null;
}

/** 直接注入已备好的索引，测试用。 */
export function setLexicon(data) {
    cache = normalize(data);
    inflight = null;
    return cache;
}

function normalize(data) {
    const entries = data && typeof data === 'object' && data.entries && typeof data.entries === 'object'
        ? data.entries
        : {};
    return { meta: data?.meta || {}, entries };
}

export async function loadLexicon(fetchImpl = globalThis.fetch) {
    if (cache) return cache;
    if (!inflight) {
        inflight = (async () => {
            const response = await fetchImpl(LEXICON_URL);
            if (!response?.ok && response?.ok !== undefined) {
                throw new Error(`术语索引加载失败: ${response.status}`);
            }
            const data = await response.json();
            cache = normalize(data);
            return cache;
        })().catch(error => {
            inflight = null;
            throw error;
        });
    }
    return inflight;
}

export function getLoadedLexicon() {
    return cache;
}

/**
 * 一个命中是不是把某个更强的词从中间切断了。
 *
 * 判据只看**重叠形态**，不看统计——因为统计区分不了：
 * 「二無」的对齐支持率 8.5%，而真术语「阿賴耶識」只有 10.5%，
 * 任何能删掉前者的阈值都会连后者一起删掉（2026-08-16 实测 8,610 条的分布）。
 *
 *   阿賴耶識 [0,4) ⊃ 識 [3,4)      短的**完全包含**在长的里 → 最长优先是对的
 *   二無     [0,2) ✕ 無我 [1,3)    短的**跨出**长的右边界   → 长的把一个词砍成了两半
 *
 * 只有跨界、且证据更强时才让路。`識`(n=5589) 虽然比 `阿賴耶識`(n=430) 强，
 * 但它不跨界，所以不会触发——这条判据不会误伤真术语。
 */
function cutsThroughStrongerTerm(text, entries, start, length) {
    const end = start + length;
    const here = entries[text.slice(start, end)];

    for (let j = start + 1; j < end; j += 1) {
        const maxLength = Math.min(MAX_TERM_LENGTH, text.length - j);
        for (let rivalLength = maxLength; rivalLength >= 1; rivalLength -= 1) {
            if (j + rivalLength <= end) break;   // 被包含，不算跨界
            const rival = entries[text.slice(j, j + rivalLength)];
            if (rival && (rival.n || 0) > (here?.n || 0)) return true;
        }
    }

    return false;
}

/**
 * 在文本里找出索引收录的术语。
 *
 * 用「最长优先」的滑窗扫描：从每个位置起先试最长的词，命中就跳过整个词，
 * 这样「阿賴耶識」不会被拆成「識」，也不会同时报「阿賴耶識」和「識」两条。
 *
 * 但最长优先单用会出事：在「二無我」上它先命中碎片「二無」并吞掉「無」，
 * 于是收录在册的「無我」(n=1523) 根本没机会参选，模型被喂进 `dvaya-abhāva`——
 * 而正解是 nairātmya。所以命中前先查它有没有把更强的词砍断。
 */
export function findLexiconTerms(text, lexicon = cache, options = {}) {
    const entries = lexicon?.entries;
    if (!entries || typeof text !== 'string' || !text) return [];

    const limit = Number.isFinite(options.limit) ? options.limit : 40;
    const seen = new Set();
    const found = [];

    for (let i = 0; i < text.length; i += 1) {
        const maxLength = Math.min(MAX_TERM_LENGTH, text.length - i);
        for (let length = maxLength; length >= 1; length -= 1) {
            const candidate = text.slice(i, i + length);
            const entry = entries[candidate];
            if (!entry) continue;
            if (cutsThroughStrongerTerm(text, entries, i, length)) continue;
            if (!seen.has(candidate)) {
                seen.add(candidate);
                found.push({ term: candidate, ...entry });
            }
            i += length - 1;
            break;
        }
    }

    /*
     * 按「信息量」排，不按出现次数排。
     *
     * 原来是 n 降序，等于「越常见越优先」——而常见恰恰意味着没有信息量。
     * 2026-08-16 实测一段《大智度論》：命中 21 条、上限 12 条，n 降序把
     * 「是時」(1430)、「佛告」(330) 塞了进去，却把尸羅／羼提／毘梨耶／禪
     * 四个波羅蜜挤了出去，译文里那几个梵文括注因此凭空消失。
     * 六波羅蜜留住数：n 降序 2/6，改为词长优先 6/6。
     *
     * 词长是个粗糙但有效的信息量代理：佛典技术术语是复合词，虚词是短词。
     * n 退居次序，用来在同长度里挑更有把握的那个。
     */
    found.sort((a, b) => b.term.length - a.term.length || (b.n || 0) - (a.n || 0));
    return found.slice(0, limit);
}

/** 一条词条渲染成一行：涅槃 ← nirvāṇa / parinirvāṇa（藏 mya ngan las 'das pa） */
export function formatLexiconEntry(entry) {
    const parts = [];
    const sanskrit = (entry.sa || []).map(([lemma]) => lemma);
    if (sanskrit.length) parts.push(`梵 ${sanskrit.join(' / ')}`);
    const tibetan = (entry.bo || []).map(([word]) => word);
    if (tibetan.length) parts.push(`藏 ${tibetan.join(' / ')}`);
    return `${entry.term}：${parts.join('；')}`;
}

/**
 * 拼成送给翻译引擎的参考术语块。
 *
 * MITRA 官方文档建议 context 控制在 400 词以内，所以这里限条数，
 * 并且只放有梵文原语、长度 ≥2 的词条 —— 单字与只有藏译的词条噪声偏高。
 */
/*
 * 叙事骨架短语。它们命中率高、却不承载教义信息，送给模型只会占掉
 * context 的名额——上限只有 12 条，每被它们占一个，就少一个真术语。
 *
 * 这是一份**人工核对过的小清单**，不是统计过滤。统计过滤在这个数据上试过两次
 * 都失败：按梵文对齐支持率筛会连「阿賴耶識」(10.5%) 一起删；按「掐掉首字后
 * 是否有更强词条」筛会把「比丘尼」「沙門尼」「瞿曇彌」判成碎片。
 * 看着有道理的判据在这里会删真术语，所以宁可手工列。
 */
const STRUCTURAL_PHRASES = new Set([
    '是時', '爾時', '佛告', '佛言', '白佛', '復次', '何以故', '所以者何',
    '如是', '乃至', '是名', '當知', '應知', '云何', '何等', '若有', '若於',
    '我今', '汝等', '如前', '廣說', '此中', '以是故', '如是行', '能得'
]);

export function buildLexiconContext(text, lexicon = cache, options = {}) {
    const maxTerms = Number.isFinite(options.maxTerms) ? options.maxTerms : 12;
    const matches = findLexiconTerms(text, lexicon, { limit: maxTerms * 3 })
        .filter(entry => entry.term.length >= MIN_TERM_LENGTH_FOR_CONTEXT)
        .filter(entry => Array.isArray(entry.sa) && entry.sa.length > 0)
        .filter(entry => !STRUCTURAL_PHRASES.has(entry.term))
        .slice(0, maxTerms);

    if (matches.length === 0) return '';

    const lines = matches.map(entry => {
        const sanskrit = entry.sa.map(([lemma]) => lemma).join(' / ');
        return `- ${entry.term} = ${sanskrit}`;
    });

    return [
        'Attested Chinese-to-Sanskrit term correspondences for this passage '
        + '(mined from aligned canonical parallels; use them unless the context clearly demands otherwise):',
        ...lines
    ].join('\n');
}
