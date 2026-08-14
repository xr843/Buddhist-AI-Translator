/**
 * MITRA 客户端 —— 对接 Dharmamitra 的两个公开接口。
 *
 *   cat-translate  多本合参翻译：同一段落的梵/巴/汉/藏写本一起送进去，
 *                  产出一份权衡各本的译文。
 *   primary        藏经语料检索：按义或按字检索，回经名、segmentnr 与阅读室深链。
 *
 * 两个接口都不需要鉴权，但**浏览器目前不能直连**，原因见下面 allowDirect 的注释。
 * 所以请求走本项目的 Cloudflare Worker 中转（worker/worker.js 的 /mitra/*）。
 *
 * 接口与参数依据 Dharmamitra 官方 agent starterpack 的公开文档：
 * https://github.com/dharmamitra/dharmamitra-claude-code-agent
 */

import { getProxyURL, hasProxyURL } from './config.js';

export const MITRA_CONFIG = {
    translateURL: 'https://dharmamitra.org/api-search/cat-translate/v1/translate',
    searchURL: 'https://dharmamitra.org/api-search/primary/',
    /**
     * 能不能从浏览器直连 dharmamitra.org。
     *
     * 2026-08-14 实测：两个端点的**实际响应**都把 `Access-Control-Allow-Origin: *`
     * 发了两遍（预检 OPTIONS 只发一遍，所以预检能过），浏览器一律拒收：
     *   "The 'Access-Control-Allow-Origin' header contains multiple values '*, *'"
     * curl 不检查这个，所以命令行看着一切正常 —— 只有真浏览器才照得出来。
     *
     * 上游把重复的响应头去掉之后，这里改成 true 就能省掉中转。
     */
    allowDirect: false,
    // 官方文档明确写了长输入可能要 60 秒，上游 Cloudflare 在 100 秒截断，
    // 所以这里必须留够，不要往下调。
    translateTimeoutMs: 95000,
    searchTimeoutMs: 45000
};

/** MITRA 现在这套部署下能不能用：有中转就能用，没有就只能等上游修好直连。 */
export function isMitraReachable() {
    return hasProxyURL() || MITRA_CONFIG.allowDirect;
}

export function resolveTranslateEndpoint() {
    const proxy = getProxyURL();
    return proxy ? `${proxy}/mitra/translate` : MITRA_CONFIG.translateURL;
}

export function resolveSearchEndpoint() {
    const proxy = getProxyURL();
    return proxy ? `${proxy}/mitra/search` : MITRA_CONFIG.searchURL;
}

/** 应用内的语种代码 → cat-translate 的写本字段。不在表里的语种 MITRA 不受理。 */
const WITNESS_FIELD = {
    'zh-classical': 'input_chinese',
    sa: 'input_sanskrit',
    'sa-hk': 'input_sanskrit',
    bo: 'input_tibetan',
    pi: 'input_pali'
};

/** 写本字段 → focus 取值。 */
const FOCUS_BY_FIELD = {
    input_chinese: 'chinese',
    input_sanskrit: 'sanskrit',
    input_tibetan: 'tibetan',
    input_pali: 'pali'
};

/**
 * 目标语种标签。cat-translate 要的是自由文本标签而不是 ISO 代码
 * （官方文档："always a label string ('english', not 'en')"）。
 */
const TARGET_LABEL = {
    zh: 'modern chinese',
    en: 'english',
    de: 'german',
    fr: 'french',
    es: 'spanish',
    pt: 'portuguese',
    it: 'italian',
    nl: 'dutch',
    ja: 'japanese',
    ko: 'korean',
    ru: 'russian',
    ar: 'arabic'
};

/** /primary/ 的语种过滤代码。 */
const SEARCH_LANG = {
    'zh-classical': 'zh',
    zh: 'zh',
    sa: 'sa',
    'sa-hk': 'sa',
    bo: 'bo',
    pi: 'pa'
};

const TIBETAN = /[ༀ-࿿]/;
const DEVANAGARI = /[ऀ-ॿ]/;
const HAN = /[一-鿿㐀-䶿]/;

/**
 * 自动判断一段文本属于哪一路写本。
 * 拉丁字母不做判断——IAST 梵文、巴利文、英文三者同形，猜错的代价比不猜大。
 */
export function detectWitnessField(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    if (TIBETAN.test(text)) return 'input_tibetan';
    if (DEVANAGARI.test(text)) return 'input_sanskrit';
    if (HAN.test(text)) return 'input_chinese';
    return null;
}

export function witnessFieldFor(sourceLang, text) {
    if (sourceLang === 'auto') return detectWitnessField(text);
    return WITNESS_FIELD[sourceLang] || null;
}

export function targetLabelFor(targetLang) {
    return TARGET_LABEL[targetLang] || null;
}

export function searchLanguageFor(sourceLang, text) {
    if (sourceLang && SEARCH_LANG[sourceLang]) return SEARCH_LANG[sourceLang];
    const field = detectWitnessField(text);
    if (field === 'input_tibetan') return 'bo';
    if (field === 'input_sanskrit') return 'sa';
    if (field === 'input_chinese') return 'zh';
    return 'all';
}

/** MITRA 能不能接这一对语种。接不了就该退回通用大模型。 */
export function canUseMitra(sourceLang, targetLang, text) {
    return Boolean(witnessFieldFor(sourceLang, text)) && Boolean(targetLabelFor(targetLang));
}

async function postJSON(url, body, timeoutMs, fetchImpl = globalThis.fetch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`MITRA 请求失败: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('MITRA 请求超时，请稍后重试');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 多本合参翻译。
 *
 * @param {object} options
 * @param {Record<string,string>} options.witnesses 写本字段 → 原文，如 { input_chinese: '如是我聞' }
 * @param {string} options.targetLabel 目标语种标签，例如 'modern chinese'
 * @param {string} [options.focus] 侧重哪一本，缺省 'equal'
 * @param {string} [options.context] 术语表、上文译文、体例说明等前置语境
 * @param {string} [options.styleInstruction] 译风指令，模型逐字照读
 */
export async function translateWithMitra(options, fetchImpl = globalThis.fetch) {
    const { witnesses, targetLabel, focus = 'equal', context = '', styleInstruction = 'balanced' } = options || {};

    const filled = Object.entries(witnesses || {})
        .filter(([, value]) => typeof value === 'string' && value.trim().length > 0);
    if (filled.length === 0) {
        throw new Error('至少需要一路写本原文');
    }
    if (!targetLabel) {
        throw new Error('MITRA 不支持该目标语种');
    }

    const body = {
        input_tibetan: '',
        input_chinese: '',
        input_pali: '',
        input_sanskrit: '',
        context,
        focus,
        target_language: targetLabel,
        style_instruction: styleInstruction
    };
    for (const [field, value] of filled) {
        body[field] = value.trim();
    }

    const data = await postJSON(resolveTranslateEndpoint(), body, MITRA_CONFIG.translateTimeoutMs, fetchImpl);
    const translation = typeof data?.translation === 'string' ? data.translation.trim() : '';
    if (!translation) {
        throw new Error('MITRA 返回数据格式错误');
    }
    return translation;
}

export function focusForField(field) {
    return FOCUS_BY_FIELD[field] || 'equal';
}

/**
 * 藏经语料检索。返回结果里 `vector` 与 `text_new` 两个大字段在这里就丢掉——
 * 前者是几百个浮点数，留着只会拖慢渲染。
 */
export async function searchCanonical(options, fetchImpl = globalThis.fetch) {
    const {
        text,
        sourceLang = 'auto',
        searchType = 'regular',
        maxDepth = 12,
        limit = 8
    } = options || {};

    const query = typeof text === 'string' ? text.trim() : '';
    if (!query) {
        throw new Error('检索内容不能为空');
    }

    const body = {
        search_input: query,
        search_type: searchType,
        filter_source_language: searchLanguageFor(sourceLang, query),
        filter_target_language: 'all',
        max_depth: maxDepth,
        limit,
        // 官方文档：最终 ranker 是给浏览器 UI 调的，程序化取用应关掉，更快。
        do_ranking: false
    };

    const data = await postJSON(resolveSearchEndpoint(), body, MITRA_CONFIG.searchTimeoutMs, fetchImpl);
    const results = Array.isArray(data?.results) ? data.results : [];

    return results.slice(0, limit).map(hit => ({
        segmentnr: hit?.segmentnr || '',
        lang: hit?.lang || '',
        source: hit?.source || '',
        title: hit?.title || '',
        text: typeof hit?.text === 'string' ? hit.text.replace(/\s+/g, ' ').trim() : '',
        // 官方文档明确要求引用时直接用返回的 src_link，不要自己拼 URL。
        link: typeof hit?.src_link === 'string' ? hit.src_link : ''
    })).filter(hit => hit.segmentnr || hit.text);
}
