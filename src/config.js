const API_KEY_STORAGE_KEY = 'deepseek_api_key';
const PROXY_STORAGE_KEY = 'translator_proxy_url';

function readStored(key) {
    try {
        return (localStorage.getItem(key) || '').trim();
    } catch {
        return '';
    }
}

// API 配置
export const API_CONFIG = {
    provider: 'deepseek',
    apiKey: readStored(API_KEY_STORAGE_KEY),
    baseURL: 'https://api.deepseek.com/v1/chat/completions',
    /**
     * Cloudflare Worker 中转地址。
     * 例如: 'https://buddhist-translator-api.your-subdomain.workers.dev'
     *
     * 两个用途：一是把 DeepSeek 密钥留在服务端，二是中转 MITRA
     * （浏览器不能直连 dharmamitra.org，原因见 src/mitra.js 里 allowDirect 的注释）。
     * 部署方在这里写死；自部署的人也可以在界面上填自己的地址，存在浏览器本地。
     */
    proxyURL: '',
    proxyURLOverride: readStored(PROXY_STORAGE_KEY)
};

export { languageMap } from './languages.js';

export function storeApiKey(apiKey) {
    const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    API_CONFIG.apiKey = normalizedApiKey;

    try {
        localStorage.setItem(API_KEY_STORAGE_KEY, normalizedApiKey);
        return true;
    } catch {
        return false;
    }
}

/** 只接受 https 的绝对地址，避免把请求发到一个拼错的相对路径上。 */
export function isValidProxyURL(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return false;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'https:' || parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    } catch {
        return false;
    }
}

export function storeProxyURL(proxyURL) {
    const normalized = typeof proxyURL === 'string' ? proxyURL.trim().replace(/\/+$/, '') : '';
    API_CONFIG.proxyURLOverride = normalized;

    try {
        if (normalized) {
            localStorage.setItem(PROXY_STORAGE_KEY, normalized);
        } else {
            localStorage.removeItem(PROXY_STORAGE_KEY);
        }
        return true;
    } catch {
        return false;
    }
}

export function getProxyURL() {
    const configured = API_CONFIG.proxyURLOverride || API_CONFIG.proxyURL;
    return String(configured || '').trim().replace(/\/+$/, '');
}

export function hasProxyURL() {
    return getProxyURL().length > 0;
}

// 翻译缓存
export const translationCache = new Map();
export const MAX_CACHE_SIZE = 100;
