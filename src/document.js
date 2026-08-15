/**
 * 整部经翻译 —— 分块与滚动上下文。
 *
 * 一框 5000 字的输入框译不了一部经：逐段各译各的，同一个术语在前后段会被译成不同说法，
 * 越往后漂得越远。做法取自 Dharmamitra 官方 agent starterpack 的翻译流程：
 * 把全文按句边界切成 3–5 句一块，**把已经译出来的上文回喂进下一块的 context**，
 * 让每一块都读得出前文是谁译的。
 *
 * 这里只放纯函数与一个可注入翻译函数的驱动器，不碰 DOM，方便测。
 */

import { countWords, truncateToWords } from './utils.js';

const ROLLING_TITLE = 'Your translation of the immediately preceding passage';

/** 一块最多几句。官方建议 3–5 句 / 80–150 词。 */
export const MAX_SENTENCES_PER_CHUNK = 5;
/** 一块的字数上限。汉文一句常在 10–40 字，这个数大致对应 3–5 句。 */
export const MAX_CHARS_PER_CHUNK = 260;
/** 单句超过这个长度就只能退让切分 —— 多半是没有句读的偈颂。 */
export const HARD_SENTENCE_LIMIT = 600;
/** context 的字数上限。官方文档建议 ~400 词。 */
export const MAX_CONTEXT_WORDS = 400;
/** 回喂几块已译上文。 */
export const ROLLING_CHUNKS = 3;

// 句末标点：汉文、西文、藏文 shad 各一套。」』 一类收尾引号要跟着句号走。
const SENTENCE_END = /([。！？；!?]+[」』"'）)】》]*)/;
const TIBETAN_SHAD = /([།༎༏༐༑]+)/;
// 退让切分时用的次级停顿
const SECONDARY_BREAK = /([，、,:：]+)/;

function splitKeepingDelimiter(text, pattern) {
    const parts = text.split(pattern);
    const out = [];
    for (let i = 0; i < parts.length; i += 2) {
        const body = parts[i] || '';
        const delimiter = parts[i + 1] || '';
        const piece = `${body}${delimiter}`;
        if (piece.trim()) out.push(piece.trim());
    }
    return out;
}

/**
 * 把一段文字切成句子。切不动的超长句（无句读的偈颂）用次级停顿退让切分，
 * 并标出来 —— 这种块的译文质量本来就该被怀疑。
 */
export function splitSentences(text) {
    if (typeof text !== 'string' || !text.trim()) return [];

    let pieces = splitKeepingDelimiter(text.trim(), SENTENCE_END);
    if (pieces.length <= 1) {
        // 没有汉文/西文句读，再试藏文 shad
        const tibetan = splitKeepingDelimiter(text.trim(), TIBETAN_SHAD);
        if (tibetan.length > 1) pieces = tibetan;
    }

    const sentences = [];
    for (const piece of pieces) {
        if (piece.length <= HARD_SENTENCE_LIMIT) {
            sentences.push({ text: piece, forced: false });
            continue;
        }
        // 退让：按次级停顿凑到长度上限就断，宁可断错也不要把整篇塞成一句
        const units = splitKeepingDelimiter(piece, SECONDARY_BREAK);
        let buffer = '';
        for (const unit of units) {
            if (buffer && buffer.length + unit.length > HARD_SENTENCE_LIMIT) {
                sentences.push({ text: buffer, forced: true });
                buffer = '';
            }
            buffer += unit;
        }
        if (buffer) sentences.push({ text: buffer, forced: true });
    }
    return sentences;
}

/** 段落是天然单位（偈颂、品节），块尽量不跨段。 */
function splitParagraphs(text) {
    return String(text || '')
        .split(/\n\s*\n+/)
        .map(paragraph => paragraph.trim())
        .filter(Boolean);
}

/**
 * 把全文切块。
 *
 * 规则：绝不切断一个句子；一块不跨段落；满 5 句或满 260 字就断。
 * 段落末尾即使不满 3 句也断 —— 段落边界比凑够句数重要。
 *
 * @returns {Array<{index:number, sentences:string[], text:string, chars:number, forced:boolean}>}
 *   `text` 已经是**一句一行**的形态：官方文档说后端偏好这个排版，
 *   句对齐与译例检索都靠它。
 */
export function chunkDocument(text, options = {}) {
    const maxSentences = options.maxSentences || MAX_SENTENCES_PER_CHUNK;
    const maxChars = options.maxChars || MAX_CHARS_PER_CHUNK;

    const chunks = [];
    let current = [];
    let currentChars = 0;
    let currentForced = false;

    const flush = () => {
        if (current.length === 0) return;
        chunks.push({
            index: chunks.length,
            sentences: current.slice(),
            text: current.join('\n'),
            chars: currentChars,
            forced: currentForced
        });
        current = [];
        currentChars = 0;
        currentForced = false;
    };

    for (const paragraph of splitParagraphs(text)) {
        for (const sentence of splitSentences(paragraph)) {
            const wouldExceed = current.length >= maxSentences
                || (current.length > 0 && currentChars + sentence.text.length > maxChars);
            if (wouldExceed) flush();

            current.push(sentence.text);
            currentChars += sentence.text.length;
            if (sentence.forced) currentForced = true;
        }
        // 段落边界一定断开，别让偈颂和长行散文粘在一块里
        flush();
    }
    flush();

    return chunks;
}

/**
 * 按优先级装 context，装不下就从**底下**丢。
 *
 * 顺序是官方文档定的，理由也在文档里：已译上文排在术语表前面，
 * 因为一份用了这些术语的上文，本身就隐含了术语表。
 *
 * @param {object} input
 * @param {string[]} input.priorTranslations 已译出的上文，越靠后越新
 * @param {string}   [input.referenceTranslation] 用户自带的旧译本片段
 * @param {string}   [input.glossary] 本块命中的术语对照
 * @param {string}   [input.namedEntities] 专名决定
 * @param {string}   [input.registerReminder] 一句话语体提醒
 */
export function buildRollingContext(input = {}) {
    const maxWords = Number.isFinite(input.maxWords) ? input.maxWords : MAX_CONTEXT_WORDS;
    const rolling = (input.priorTranslations || [])
        .filter(entry => typeof entry === 'string' && entry.trim())
        .slice(-(input.rollingChunks || ROLLING_CHUNKS));

    const sections = [];
    let budget = maxWords;

    // 1. 已译上文 —— 最高优先级。从最新的往回收，收到装不下为止；
    //    连一块都装不下时截断保留末尾，而不是整节丢掉：
    //    「上一段你是怎么译的」是这个功能唯一的立身之本，丢了它就退化成逐段各译各的。
    if (rolling.length > 0) {
        const kept = [];
        for (let i = rolling.length - 1; i >= 0; i -= 1) {
            const candidate = [rolling[i], ...kept].join('\n');
            if (countWords(renderSection(ROLLING_TITLE, candidate)) > budget) break;
            kept.unshift(rolling[i]);
        }
        if (kept.length === 0) {
            const overhead = countWords(renderSection(ROLLING_TITLE, ''));
            const trimmed = truncateToWords(rolling[rolling.length - 1], Math.max(0, budget - overhead));
            if (trimmed) kept.push(trimmed);
        }
        if (kept.length > 0) {
            const block = renderSection(ROLLING_TITLE, kept.join('\n'));
            sections.push(block);
            budget -= countWords(block);
        }
    }

    // 2–5. 其余按序装。装不下就**从这一节往下全丢**，而不是跳过它继续装后面的 ——
    // 官方文档说的是「drop from the bottom」，一个便宜的低优先级小节挤掉一个贵的
    // 高优先级小节，就不是这个意思了。
    const rest = [
        ['A previously published translation of this same work', input.referenceTranslation],
        ['Attested term correspondences for this passage', input.glossary],
        ['Names already fixed earlier in this document', input.namedEntities],
        ['Register', input.registerReminder]
    ];
    for (const [title, body] of rest) {
        // 压根没给的小节不算「被丢」，不该挡住它下面的
        if (typeof body !== 'string' || !body.trim()) continue;
        const block = renderSection(title, body.trim());
        const cost = countWords(block);
        if (cost > budget) break;
        sections.push(block);
        budget -= cost;
    }

    return sections.join('\n\n');
}

function renderSection(title, body) {
    return `${title}:\n${body}`;
}

/**
 * 逐块翻译一部文档。
 *
 * 做成异步生成器，是因为调用方要能**中途停下**：官方文档说长文翻译最大的失败模式
 * 就是术语漂移，而对付漂移的办法是短反馈环 —— 每几块停一次让人改术语再继续。
 * 生成器天然支持「不再取下一个就结束」。
 *
 * @param {object} job
 * @param {string} job.text 全文
 * @param {(chunk: object) => Promise<{text:string}>} translateChunk 注入的翻译函数
 */
export async function* translateDocument(job, translateChunk) {
    const chunks = chunkDocument(job.text, job);
    const done = [];

    yield { type: 'start', total: chunks.length, chunks };

    for (const chunk of chunks) {
        const context = buildRollingContext({
            priorTranslations: done.map(entry => entry.translation),
            referenceTranslation: job.referenceTranslation,
            glossary: typeof job.glossaryFor === 'function' ? job.glossaryFor(chunk.text) : job.glossary,
            namedEntities: job.namedEntities,
            registerReminder: job.registerReminder,
            rollingChunks: job.rollingChunks,
            maxWords: job.maxContextWords
        });

        let translation;
        try {
            const outcome = await translateChunk({ chunk, context, index: chunk.index, total: chunks.length });
            translation = typeof outcome === 'string' ? outcome : outcome?.text;
        } catch (error) {
            yield { type: 'error', index: chunk.index, total: chunks.length, chunk, error };
            return { chunks: done, aborted: true };
        }

        if (typeof translation !== 'string' || !translation.trim()) {
            yield {
                type: 'error',
                index: chunk.index,
                total: chunks.length,
                chunk,
                error: new Error('翻译结果为空')
            };
            return { chunks: done, aborted: true };
        }

        const entry = { chunk, translation: translation.trim(), context };
        done.push(entry);
        yield { type: 'chunk', index: chunk.index, total: chunks.length, ...entry };
    }

    yield { type: 'done', total: chunks.length, chunks: done };
    return { chunks: done, aborted: false };
}

/** 导出成原文译文对照的 markdown，方便继续校改。 */
export function renderDocumentMarkdown(entries, meta = {}) {
    const header = [
        `# ${meta.title || '译文'}`,
        '',
        meta.engine ? `- 引擎：${meta.engine}` : '',
        meta.style ? `- 译风：${meta.style}` : '',
        `- 分块：${entries.length}`,
        ''
    ].filter(Boolean);

    const body = entries.map((entry, index) => [
        `## ${index + 1}`,
        '',
        '```',
        entry.chunk.text,
        '```',
        '',
        entry.translation,
        ''
    ].join('\n'));

    return [...header, ...body].join('\n');
}
