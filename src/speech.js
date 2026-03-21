import { escapeHtml } from './utils.js';

// 语音相关状态
let recognition = null;
let synthesis = null;
let availableVoices = [];
let selectedVoice = null;
let currentSpeaking = false;
let currentUtterance = null;
let speakingSegments = [];
let currentSegmentIndex = 0;

// 获取目标语言元素的引用（延迟绑定）
let getTargetLang = () => 'zh';
let getResultDiv = () => null;

export function initSpeech(targetLangGetter, resultDivGetter) {
    getTargetLang = targetLangGetter;
    getResultDiv = resultDivGetter;

    // 语音识别
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'zh-CN';
    }

    // 语音合成
    if ('speechSynthesis' in window) {
        synthesis = window.speechSynthesis;
        loadAvailableVoices();
        if (synthesis.onvoiceschanged !== undefined) {
            synthesis.onvoiceschanged = loadAvailableVoices;
        }
    }
}

function loadAvailableVoices() {
    availableVoices = synthesis.getVoices();
}

export function startVoiceInput(onResult) {
    if (!recognition) return { supported: false };

    recognition.onresult = (event) => {
        onResult(event.results[0][0].transcript);
    };
    recognition.start();
    return { supported: true };
}

export function speakResult() {
    const resultDiv = getResultDiv();
    if (!synthesis) return { error: 'not-supported' };

    const text = resultDiv.textContent;
    if (!text || text.includes('翻译结果将显示在这里')) {
        return { error: 'no-content' };
    }

    if (currentSpeaking) {
        stopSpeaking();
        return { action: 'stopped' };
    }

    if (synthesis.speaking) {
        synthesis.cancel();
        setTimeout(() => {
            if (!synthesis.speaking) startSpeaking(text);
        }, 100);
    } else {
        startSpeaking(text);
    }
    return { action: 'started' };
}

function startSpeaking(text) {
    const cleanText = text.replace(/^\s*翻译结果：?\s*/, '').trim();

    selectedVoice = selectBestVoiceForLanguage(getTargetLang());
    if (!selectedVoice) return;

    speakingSegments = segmentTextForSpeech(cleanText);
    if (speakingSegments.length === 0) return;

    currentSegmentIndex = 0;
    currentSpeaking = true;

    highlightSpeechSegment(0);
    setTimeout(() => {
        if (currentSpeaking) speakNextSegment();
    }, 50);
}

export function stopSpeaking() {
    currentSpeaking = false;
    try {
        if (synthesis?.speaking) synthesis.cancel();
    } catch (_) { /* ignore */ }

    currentUtterance = null;
    selectedVoice = null;
    clearSpeechHighlight();
}

export function isSpeaking() {
    return currentSpeaking;
}

function speakNextSegment() {
    if (!currentSpeaking || currentSegmentIndex >= speakingSegments.length) {
        stopSpeaking();
        return;
    }

    const segment = speakingSegments[currentSegmentIndex];
    highlightSpeechSegment(currentSegmentIndex);

    currentUtterance = new SpeechSynthesisUtterance(segment.text);

    if (selectedVoice) {
        currentUtterance.voice = selectedVoice;
        currentUtterance.lang = selectedVoice.lang;
    } else {
        currentUtterance.lang = getVoiceLang(getTargetLang());
    }

    currentUtterance.rate = 1.0;
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;

    currentUtterance.onstart = () => {
        if (currentSpeaking) highlightSpeechSegment(currentSegmentIndex);
    };

    currentUtterance.onend = () => {
        if (currentSpeaking && currentSegmentIndex < speakingSegments.length - 1) {
            currentSegmentIndex++;
            setTimeout(() => {
                if (currentSpeaking) speakNextSegment();
            }, 100);
        } else {
            stopSpeaking();
        }
    };

    currentUtterance.onerror = (event) => {
        if (currentSpeaking) {
            stopSpeaking();
            if (event.error !== 'interrupted' && event.error !== 'canceled') {
                console.error('语音合成错误:', event);
            }
        }
    };

    currentUtterance.onboundary = () => {
        if (currentSpeaking) highlightSpeechSegment(currentSegmentIndex);
    };

    try {
        synthesis.speak(currentUtterance);
    } catch (error) {
        console.error('启动语音合成失败:', error);
        stopSpeaking();
    }
}

// --- 文本分段 ---

function segmentTextForSpeech(text) {
    const targetLang = getTargetLang();

    if (targetLang === 'en' || ['fr', 'de', 'es', 'pt', 'it', 'nl', 'ru'].includes(targetLang)) {
        return segmentWesternLanguage(text);
    } else if (targetLang === 'ja') {
        return segmentJapaneseLanguage(text);
    } else if (targetLang === 'ko') {
        return segmentKoreanLanguage(text);
    } else if (targetLang === 'ar') {
        return segmentArabicLanguage(text);
    }
    return segmentChineseLanguage(text);
}

function segmentWesternLanguage(text) {
    const segments = [];
    const sentences = text.split(/([.!?;]\s+)/);
    let currentText = '';

    for (const part of sentences) {
        if (!part.trim()) continue;
        currentText += part;
        if (/[.!?;]\s+/.test(part) || currentText.length > 100) {
            if (currentText.trim()) {
                segments.push({ text: currentText.trim() });
                currentText = '';
            }
        }
    }
    if (currentText.trim()) segments.push({ text: currentText.trim() });
    return reindexSegments(segments, text);
}

function segmentChineseLanguage(text) {
    const segments = [];
    const sentences = text.split(/([。！？]\s*)/);
    let currentText = '';

    for (const part of sentences) {
        if (!part.trim()) continue;
        currentText += part;

        if (/^[。！？]\s*$/.test(part)) {
            if (currentText.trim()) {
                segments.push({ text: currentText.trim() });
                currentText = '';
            }
        } else if (currentText.length > 80) {
            const longParts = currentText.split(/([；]\s*)/);
            let longText = '';
            for (const lp of longParts) {
                longText += lp;
                if (/[；]\s*/.test(lp) && longText.trim()) {
                    segments.push({ text: longText.trim() });
                    longText = '';
                }
            }
            if (longText.trim()) segments.push({ text: longText.trim() });
            currentText = '';
        }
    }
    if (currentText.trim()) segments.push({ text: currentText.trim() });
    return reindexSegments(segments, text);
}

function segmentJapaneseLanguage(text) {
    const segments = [];
    const sentences = text.split(/([。！？．]\s*)/);
    let currentText = '';

    for (const part of sentences) {
        if (!part.trim()) continue;
        currentText += part;
        if (/^[。！？．]\s*$/.test(part) || currentText.length > 60) {
            if (currentText.trim()) {
                segments.push({ text: currentText.trim() });
                currentText = '';
            }
        }
    }
    if (currentText.trim()) segments.push({ text: currentText.trim() });
    return reindexSegments(segments, text);
}

function segmentKoreanLanguage(text) {
    const segments = [];
    const koreanPatterns = [
        '다\\.', '다"', '다,', '다\\s',
        '요\\.', '요"', '요,',
        '습니다', '입니다', '있다', '없다', '한다', '된다',
        '라고', '지만', '고\\s', '며\\s'
    ];

    let sentences = text.split(/([.。！？]\s*)/);

    if (sentences.length <= 2) {
        const pattern = new RegExp(`(${koreanPatterns.join('|')})`, 'g');
        sentences = text.split(pattern);
    }
    if (sentences.length <= 2) {
        sentences = text.split(/([,，]\s*)/);
    }
    if (sentences.length <= 2 || sentences.every(s => s.length > 100)) {
        sentences = [];
        for (let i = 0; i < text.length; i += 40) {
            const seg = text.substring(i, i + 40);
            if (seg.trim()) sentences.push(seg);
        }
    }

    let currentText = '';
    for (const part of sentences) {
        if (!part?.trim()) continue;
        currentText += part;
        const shouldEnd =
            /^[.。！？,，]\s*$/.test(part) ||
            /(?:다|요|습니다|입니다)[\s".,]/.test(part) ||
            currentText.length > 60;
        if (shouldEnd && currentText.trim()) {
            segments.push({ text: currentText.trim() });
            currentText = '';
        }
    }
    if (currentText.trim()) segments.push({ text: currentText.trim() });

    if (segments.length === 0) {
        for (let i = 0; i < text.length; i += 35) {
            const chunk = text.substring(i, i + 35).trim();
            if (chunk) segments.push({ text: chunk, startIndex: i, length: chunk.length });
        }
    }

    return reindexSegments(segments, text);
}

function segmentArabicLanguage(text) {
    const segments = [];
    const sentences = text.split(/([.!?؟]\s+)/);
    let currentText = '';

    for (const part of sentences) {
        if (!part.trim()) continue;
        currentText += part;
        if (/[.!?؟]\s+/.test(part) || currentText.length > 80) {
            if (currentText.trim()) {
                segments.push({ text: currentText.trim() });
                currentText = '';
            }
        }
    }
    if (currentText.trim()) segments.push({ text: currentText.trim() });
    return reindexSegments(segments, text);
}

function reindexSegments(segments, text) {
    const final = [];
    let searchIndex = 0;
    for (const seg of segments) {
        if (!seg.text) continue;
        const idx = text.indexOf(seg.text, searchIndex);
        if (idx !== -1) {
            final.push({ text: seg.text, startIndex: idx, length: seg.text.length });
            searchIndex = idx + seg.text.length;
        }
    }
    return final;
}

// --- 高亮 ---

function highlightSpeechSegment(segmentIndex) {
    const resultDiv = getResultDiv();
    const translationText = resultDiv?.querySelector('.translation-text');
    if (!translationText) return;

    let originalText = (translationText.textContent || '').replace(/^\s*翻译结果：?\s*/, '').trim();
    let html = '';
    let lastIdx = 0;

    speakingSegments.forEach((seg, idx) => {
        const start = originalText.indexOf(seg.text, lastIdx);
        if (start >= lastIdx) {
            if (start > lastIdx) html += escapeHtml(originalText.substring(lastIdx, start));
            const cls = idx === segmentIndex ? 'current' : idx < segmentIndex ? 'completed' : 'pending';
            html += `<span class="speech-highlight ${cls}" data-segment="${idx}">${escapeHtml(seg.text)}</span>`;
            lastIdx = start + seg.text.length;
        }
    });

    if (lastIdx < originalText.length) {
        html += escapeHtml(originalText.substring(lastIdx));
    }

    translationText.innerHTML = html;

    const current = translationText.querySelector('.speech-highlight.current');
    if (current) current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

function clearSpeechHighlight() {
    const resultDiv = getResultDiv();
    const translationText = resultDiv?.querySelector('.translation-text');
    if (translationText) {
        translationText.innerHTML = escapeHtml(translationText.textContent);
    }
}

// --- 语音选择 ---

function getVoiceLang(langCode) {
    const map = {
        'zh': 'zh-CN', 'zh-classical': 'zh-CN', 'en': 'en-US',
        'ja': 'ja-JP', 'ko': 'ko-KR', 'fr': 'fr-FR', 'de': 'de-DE',
        'es': 'es-ES', 'pt': 'pt-PT', 'it': 'it-IT', 'nl': 'nl-NL',
        'ru': 'ru-RU', 'ar': 'ar-SA'
    };
    return map[langCode] || 'zh-CN';
}

function selectBestVoiceForLanguage(langCode) {
    if (availableVoices.length === 0) return null;

    const targetLang = getVoiceLang(langCode);
    const matching = availableVoices.filter(v =>
        v.lang.startsWith(targetLang.split('-')[0]) || v.lang === targetLang
    );

    if (matching.length === 0) {
        return availableVoices.find(v => v.default) || availableVoices[0] || null;
    }

    // 优先级: Microsoft > Google > 本地 > 默认 > 第一个
    return matching.find(v => v.name.toLowerCase().includes('microsoft'))
        || matching.find(v => v.name.toLowerCase().includes('google'))
        || matching.find(v => v.localService)
        || matching.find(v => v.default)
        || matching[0];
}
