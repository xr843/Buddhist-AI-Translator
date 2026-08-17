// HTML 转义，防止 XSS
export function escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

// 输入安全验证
export function validateInput(text) {
    const dangerousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
        /javascript:/gi
    ];
    let cleanText = text;
    dangerousPatterns.forEach(pattern => {
        cleanText = cleanText.replace(pattern, '');
    });
    cleanText = cleanText.replace(/<[^>]*>/g, tag => (
        tag.replace(/\s+on[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    ));
    return cleanText.trim();
}

export function limitTextLength(text, maxLength) {
    const value = typeof text === 'string' ? text : '';
    if (value.length <= maxLength) {
        return {
            text: value,
            length: value.length,
            truncated: false
        };
    }

    const truncatedText = value.substring(0, maxLength);
    return {
        text: truncatedText,
        length: truncatedText.length,
        truncated: true
    };
}

// 移除翻译结果中的引号
export function removeQuotes(text) {
    if (!text || typeof text !== 'string') return text;

    let result = text.trim();

    const quotePatterns = [
        ['"', '"'],
        ["'", "'"],
        ["\u201c", "\u201d"],
        ["\u2018", "\u2019"],
        ["\u300c", "\u300d"],
        ["\u300e", "\u300f"],
        ["\u00ab", "\u00bb"],
        ["\u201e", "\u201c"],
        ["\u201a", "\u2019"],
        ["\u201b", "\u2019"],
        ["\u201c", "\u201d"],
        ["\u2018", "\u2019"],
        ["\u300a", "\u300b"],
        ["\u3008", "\u3009"],
        ["\u2039", "\u203a"],
        ["\u301d", "\u301e"],
        ["\u275d", "\u275e"],
        ["\u275b", "\u275c"],
        ["\u276e", "\u276f"]
    ];

    for (const [startQuote, endQuote] of quotePatterns) {
        if (result.startsWith(startQuote) && result.endsWith(endQuote)) {
            result = result.slice(startQuote.length, -endQuote.length);
            break;
        }
    }

    return result;
}

// Toast 消息提示
export function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => messageDiv.classList.add('show'), 10);

    setTimeout(() => {
        messageDiv.classList.remove('show');
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 300);
    }, 3000);
}

/*
 * 版权年份。硬编码一个年份必然会过期——2026-08-17 页脚上写的还是 2025。
 * 所以只把**起始年**写进 HTML 当兜底，当前年由这里算出来接上。
 *
 * 惯例是「起始年–最近更新年」，只有两者相同时才写单个年份。
 * 用短横线（en dash），不是连字符。
 */
export function copyrightYears(startYear, currentYear) {
    const start = Number(startYear);
    const current = Number(currentYear);
    if (!Number.isFinite(start)) return '';
    // 系统时钟不可信时（往前调过、或没设好）不要倒着写成 2026–2025
    if (!Number.isFinite(current) || current <= start) return String(start);
    return `${start}–${current}`;
}
