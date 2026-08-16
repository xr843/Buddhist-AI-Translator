/**
 * 自动取回一段汉文的梵／藏平行本，填进「多本合参」。
 *
 * 数据来自 fojin 的托管 MCP 端点，但**必须过中转**：2026-08-16 实测，
 * `mcp.fojin.ai` 对任何带 `Origin` 的请求一律 403 且不回 CORS 头
 * （不带 Origin 才 200）。那是刻意的——MCP 端点只服务服务端客户端。
 * 定位、取平行段、按 chunk 收敛三步都在 Worker 里做完，浏览器只收结果：
 * 一卷能返回 685 条平行段，全发过来既慢又没用。
 *
 * ⚠️ 覆盖率**不是全藏通用**。行级密度中位数只有 16%——俱舍釋論 67%、
 * 涅槃經 64%、瑜伽師地論 57%，而大智度論只有 14%。所以「取不到」是常态，
 * 界面必须照实说，不能留一个空着的框。理由与实测见 docs/competitive-baseline.md。
 */
import { getProxyURL } from './config.js';

/** 取不到时的原因，界面据此说人话。 */
export const WITNESS_MISS = {
    NO_PROXY: 'no-proxy',
    NOT_LOCATED: 'not-located',
    NO_PARALLEL: 'no-parallel',
    FAILED: 'failed'
};

export function witnessesAvailable() {
    return Boolean(getProxyURL());
}

/**
 * @param {string} text 用户粘的汉文
 * @returns {Promise<{found: boolean, reason?: string, source?: object, witnesses?: object}>}
 */
export async function fetchWitnesses(text, fetchImpl = globalThis.fetch) {
    const passage = typeof text === 'string' ? text.trim() : '';
    if (!passage) return { found: false, reason: WITNESS_MISS.NOT_LOCATED };

    const proxy = getProxyURL();
    // 没有中转就没有这个功能——不要退回直连，那必定 403。
    if (!proxy) return { found: false, reason: WITNESS_MISS.NO_PROXY };

    let response;
    try {
        response = await fetchImpl(`${proxy}/fojin/witnesses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: passage })
        });
    } catch {
        return { found: false, reason: WITNESS_MISS.FAILED };
    }

    if (!response.ok) return { found: false, reason: WITNESS_MISS.FAILED };

    let data;
    try {
        data = await response.json();
    } catch {
        return { found: false, reason: WITNESS_MISS.FAILED };
    }

    if (!data?.found) {
        return { found: false, reason: data?.reason || WITNESS_MISS.FAILED, source: data?.source };
    }

    // 只把真有内容的那几路交出去，空字符串填进输入框只会让人以为坏了
    const witnesses = {};
    for (const [lang, value] of Object.entries(data.witnesses || {})) {
        if (typeof value === 'string' && value.trim()) witnesses[lang] = value.trim();
    }

    if (Object.keys(witnesses).length === 0) {
        return { found: false, reason: WITNESS_MISS.NO_PARALLEL, source: data.source };
    }

    return { found: true, source: data.source, witnesses, counts: data.counts };
}

/** 取不到时给用户看的一句话。说清楚是哪一种「没有」。 */
export function describeWitnessMiss(reason, source) {
    switch (reason) {
        case WITNESS_MISS.NO_PROXY:
            return '自动取回平行本需要先配置 Worker 中转（见「配置API」）。';
        case WITNESS_MISS.NOT_LOCATED:
            return '这段文字没能在藏经语料中逐字定位到。可能是现代文、意引，或者段落跨了语料的切分边界——换短一点的一段再试。';
        case WITNESS_MISS.NO_PARALLEL:
            return source?.title
                ? `已定位到《${source.title}》，但这一段没有梵／藏平行本。平行语料只覆盖部分经论，主干论典命中率较高。`
                : '已定位到出处，但这一段没有梵／藏平行本。';
        default:
            return '平行本服务暂时不可用，稍后再试。';
    }
}
