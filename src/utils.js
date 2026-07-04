// HTML 转义，防止 XSS
export function escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 输入安全验证
export function validateInput(text) {
    const dangerousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi
    ];
    let cleanText = text;
    dangerousPatterns.forEach(pattern => {
        cleanText = cleanText.replace(pattern, '');
    });
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
