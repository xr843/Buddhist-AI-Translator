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

const CJK = /[㐀-鿿豈-﫿]/g;
// 藏文用 tsheg（་）分音节，不用空格，不特别处理的话整句会被算成一个词
const TIBETAN_SEPARATOR = /[་༌]/g;

/**
 * 粗略数词数，用来给送进模型的上下文定预算。
 * 汉字按字算，其余按空白分词 —— 不求精确，够用来卡 400 词的上限就行。
 */
export function countWords(text) {
    if (typeof text !== 'string' || !text) return 0;
    const cjkCount = (text.match(CJK) || []).length;
    const rest = text.replace(CJK, ' ').replace(TIBETAN_SEPARATOR, ' ');
    const restCount = (rest.match(/\S+/g) || []).length;
    return cjkCount + restCount;
}

/** 按词数截断，保留**末尾** —— 上下文里越靠近当前段落的越有用。 */
export function truncateToWords(text, maxWords) {
    if (typeof text !== 'string' || !text) return '';
    if (maxWords <= 0) return '';
    if (countWords(text) <= maxWords) return text;

    const lines = text.split('\n');
    const kept = [];
    let used = 0;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const cost = countWords(lines[i]);
        if (used + cost > maxWords && kept.length > 0) break;
        kept.unshift(lines[i]);
        used += cost;
        if (used >= maxWords) break;
    }
    return kept.join('\n');
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
