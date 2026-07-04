function readStoredApiKey() {
    try {
        return localStorage.getItem('deepseek_api_key') || '';
    } catch {
        return '';
    }
}

// API 配置
export const API_CONFIG = {
    provider: 'deepseek',
    apiKey: readStoredApiKey(),
    baseURL: 'https://api.deepseek.com/v1/chat/completions',
    // 代理模式：设置为 Cloudflare Worker URL 后自动启用代理
    // 例如: 'https://buddhist-translator-api.your-subdomain.workers.dev'
    proxyURL: ''
};

export { languageMap } from './languages.js';

// 翻译缓存
export const translationCache = new Map();
export const MAX_CACHE_SIZE = 100;
