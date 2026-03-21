import { API_CONFIG, languageMap, translationCache, MAX_CACHE_SIZE } from './config.js';
import { removeQuotes } from './utils.js';

// 加载术语数据库
let buddhistTerms = {};

export async function loadTerms() {
    try {
        const response = await fetch('./src/terms.json');
        const data = await response.json();
        // 将分类术语展平为一级对象
        buddhistTerms = {};
        for (const category of Object.values(data)) {
            Object.assign(buddhistTerms, category);
        }
    } catch (error) {
        console.error('术语库加载失败:', error);
    }
}

// 缓存相关
function getCacheKey(text, sourceLang, targetLang) {
    return `${sourceLang}->${targetLang}:${text.trim()}`;
}

function cleanCache() {
    if (translationCache.size >= MAX_CACHE_SIZE) {
        const firstKey = translationCache.keys().next().value;
        translationCache.delete(firstKey);
    }
}

// 构建翻译 prompt
function createTranslationPrompt(text, sourceLang, targetLang) {
    const langMap = {
        'auto': '自动检测', 'zh': '中文', 'zh-classical': '文言文', 'en': '英文',
        'sa': '梵文', 'sa-hk': '梵文转写', 'bo': '藏文', 'pi': '巴利文',
        'fr': '法文', 'de': '德文', 'es': '西班牙文', 'pt': '葡萄牙文',
        'it': '意大利文', 'nl': '荷兰文', 'ja': '日文', 'ko': '韩文',
        'ru': '俄文', 'ar': '阿拉伯文'
    };

    const sourceDesc = langMap[sourceLang] || '未知语言';
    const targetDesc = langMap[targetLang] || '未知语言';

    let prompt = `将${sourceDesc}翻译为${targetDesc}：\n\n${text}\n\n`;

    if (targetLang === 'zh') {
        prompt += '要求：准确翻译佛教术语，使用现代中文。';
    } else if (targetLang === 'zh-classical') {
        prompt += '要求：翻译为文言文，保持庄严性。';
    } else {
        prompt += '要求：准确翻译，保持佛教术语的正确性。';
    }

    prompt += '\n\n直接返回翻译结果，无需引号或解释。';
    return prompt;
}

// DeepSeek API 翻译（支持直连和代理模式）
export async function translateWithDeepSeek(text, sourceLang, targetLang) {
    const useProxy = !!API_CONFIG.proxyURL;

    if (!useProxy && !API_CONFIG.apiKey) {
        throw new Error('API密钥未配置');
    }

    // 检查缓存
    const cacheKey = getCacheKey(text, sourceLang, targetLang);
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    const prompt = createTranslationPrompt(text, sourceLang, targetLang);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        let response;

        if (useProxy) {
            // 代理模式：密钥存在服务端，前端只发翻译请求
            response = await fetch(`${API_CONFIG.proxyURL}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    sourceLang,
                    targetLang,
                    prompt
                }),
                signal: controller.signal
            });
        } else {
            // 直连模式：密钥在前端 localStorage
            response = await fetch(API_CONFIG.baseURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_CONFIG.apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: '你是佛教文献翻译专家，提供准确、简洁的翻译。' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 800,
                    top_p: 0.9,
                    stream: false
                }),
                signal: controller.signal
            });
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API请求失败: ${response.status} ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();

        let result;
        if (useProxy) {
            // 代理返回格式: { translation: "..." }
            result = (data.translation || '').trim();
        } else {
            if (!data.choices?.[0]?.message) {
                throw new Error('API返回数据格式错误');
            }
            result = data.choices[0].message.content.trim();
        }

        result = removeQuotes(result);

        // 缓存结果
        cleanCache();
        translationCache.set(cacheKey, result);

        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('翻译请求超时，请稍后重试');
        }
        throw error;
    }
}

// 内置降级翻译
export function translateWithBuiltIn(text, sourceLang, targetLang) {
    // 检查佛教术语
    for (const [term, translation] of Object.entries(buddhistTerms)) {
        if (text.includes(term)) {
            if (targetLang === 'en') {
                return removeQuotes(translation.split(' / ')[1] || translation);
            } else if (targetLang === 'sa') {
                return removeQuotes(translation.split(' / ')[2] || translation);
            }
        }
    }

    if (sourceLang === 'zh-classical' && targetLang === 'zh') {
        return `${text}（现代中文解释：这是一段古典佛教文献，建议使用AI翻译获得更准确的现代中文解释）`;
    } else if (targetLang === 'zh') {
        return `${text}（建议使用AI翻译获得更准确的翻译结果）`;
    } else if (targetLang === 'en') {
        return `${text} (Please use AI translation for more accurate results)`;
    }
    return `翻译暂不支持此语言对：${languageMap[sourceLang]} → ${languageMap[targetLang]}`;
}

// 检查是否有缓存命中
export function hasCachedTranslation(text, sourceLang, targetLang) {
    return translationCache.has(getCacheKey(text, sourceLang, targetLang));
}
