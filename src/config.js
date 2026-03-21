// API 配置
export const API_CONFIG = {
    provider: 'deepseek',
    apiKey: localStorage.getItem('deepseek_api_key') || '',
    baseURL: 'https://api.deepseek.com/v1/chat/completions',
    // 代理模式：设置为 Cloudflare Worker URL 后自动启用代理
    // 例如: 'https://buddhist-translator-api.your-subdomain.workers.dev'
    proxyURL: ''
};

// 语言映射
export const languageMap = {
    'auto': '自动检测',
    'zh': '现代中文',
    'zh-classical': '文言文',
    'en': '英文',
    'sa': '梵文 (Devanagari)',
    'sa-hk': '梵文 (Harvard-Kyoto)',
    'bo': '藏文 (Unicode)',
    'pi': '巴利文',
    'fr': '法文',
    'de': '德文',
    'es': '西班牙文',
    'pt': '葡萄牙文',
    'it': '意大利文',
    'nl': '荷兰文',
    'ja': '日文',
    'ko': '韩文',
    'ru': '俄文',
    'ar': '阿拉伯文',
    'other': '其他'
};

// 翻译缓存
export const translationCache = new Map();
export const MAX_CACHE_SIZE = 100;
