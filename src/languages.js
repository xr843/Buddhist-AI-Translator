// Shared language labels used by the UI and translation prompts.
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

export function getLanguageLabel(language, fallback = '未知语言') {
    if (typeof language !== 'string' || !language.trim()) {
        return fallback;
    }

    return languageMap[language] || fallback;
}
