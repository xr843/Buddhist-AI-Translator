import { API_CONFIG, languageMap } from './config.js';
import { escapeHtml, validateInput, showMessage } from './utils.js';
import { translateWithDeepSeek, translateWithBuiltIn, hasCachedTranslation } from './translator.js';
import { initSpeech, startVoiceInput, speakResult, stopSpeaking, isSpeaking } from './speech.js';

// DOM 元素
let sourceTextArea, targetSelect, sourceSelect, translateBtn, resultDiv, charCount;
let sourceLabelSpan, targetLabelSpan;

export function initializeUI() {
    // 绑定 DOM 元素
    sourceTextArea = document.getElementById('source-text');
    targetSelect = document.getElementById('target-lang');
    sourceSelect = document.getElementById('source-lang');
    translateBtn = document.getElementById('translate-btn');
    resultDiv = document.getElementById('translation-result');
    charCount = document.querySelector('.char-count');
    sourceLabelSpan = document.getElementById('source-label');
    targetLabelSpan = document.getElementById('target-label');

    // 初始化语音模块
    initSpeech(
        () => targetSelect.value,
        () => resultDiv
    );

    bindEvents();
    updateLanguageLabels();
    checkApiKeyStatus();
}

function bindEvents() {
    translateBtn.addEventListener('click', handleTranslate);
    sourceTextArea.addEventListener('input', updateCharCount);
    sourceSelect.addEventListener('change', updateLanguageLabels);
    targetSelect.addEventListener('change', updateLanguageLabels);
    document.addEventListener('keydown', handleKeyboardShortcuts);

    document.getElementById('clear-input').addEventListener('click', clearInput);
    document.getElementById('copy-btn').addEventListener('click', copyResult);
    document.getElementById('voice-input').addEventListener('click', handleVoiceInput);
    document.getElementById('speaker-btn').addEventListener('click', handleSpeak);
    document.getElementById('paste-btn').addEventListener('click', pasteText);
    document.getElementById('swap-btn').addEventListener('click', swapLanguages);

    // API 设置
    document.getElementById('api-settings-btn').addEventListener('click', showApiSettings);
    document.getElementById('modal-close').addEventListener('click', hideApiSettings);
    document.getElementById('cancel-btn').addEventListener('click', hideApiSettings);
    document.getElementById('save-api-key').addEventListener('click', saveApiKey);
    document.getElementById('api-modal-overlay').addEventListener('click', function (e) {
        if (e.target === this) hideApiSettings();
    });
}

function handleKeyboardShortcuts(event) {
    if (!event.ctrlKey) return;

    if (event.key === 'Enter') {
        event.preventDefault();
        handleTranslate();
        return;
    }

    if (!event.shiftKey) return;

    if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copyResult();
    } else if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteText();
    } else if (event.key.toLowerCase() === 'x') {
        event.preventDefault();
        clearInput();
    }
}

// --- 翻译 ---

async function handleTranslate() {
    const rawText = sourceTextArea.value.trim();
    if (!rawText) {
        showMessage('请输入要翻译的文本', 'warning');
        return;
    }

    const sourceText = validateInput(rawText);
    if (sourceText !== rawText) {
        showMessage('检测到不安全内容，已自动清理', 'warning');
    }

    const sourceLang = sourceSelect.value;
    const targetLang = targetSelect.value;

    if (sourceLang === targetLang && sourceLang !== 'auto') {
        showMessage('源语言和目标语言不能相同', 'warning');
        return;
    }

    translateBtn.disabled = true;

    try {
        const isFromCache = hasCachedTranslation(sourceText, sourceLang, targetLang);
        translateBtn.innerHTML = isFromCache
            ? '<i class="fas fa-bolt"></i> 快速翻译...'
            : '<i class="fas fa-spinner fa-spin"></i> AI翻译中...';

        try {
            const result = await translateWithDeepSeek(sourceText, sourceLang, targetLang);
            resultDiv.innerHTML = `<div class="translation-text">${escapeHtml(result)}</div>`;
            if (isFromCache) showMessage('使用缓存结果，响应更快！', 'success');
        } catch (apiError) {
            console.log('API翻译失败，使用内置翻译:', apiError.message);
            const result = translateWithBuiltIn(sourceText, sourceLang, targetLang);
            resultDiv.innerHTML = `<div class="translation-text">${escapeHtml(result)}</div>`;
            showMessage('API暂时不可用，使用内置翻译', 'warning');
        }
    } catch (error) {
        console.error('翻译错误:', error);
        resultDiv.innerHTML = '<div class="error">翻译失败，请稍后重试</div>';
        showMessage('翻译失败: ' + error.message, 'error');
    } finally {
        translateBtn.disabled = false;
        translateBtn.innerHTML = '<i class="fas fa-language"></i> 翻译';
    }
}

// --- 工具函数 ---

function updateCharCount() {
    const text = sourceTextArea.value;
    charCount.textContent = `${text.length} / 5000`;
    if (text.length > 5000) {
        charCount.style.color = '#e74c3c';
        sourceTextArea.value = text.substring(0, 5000);
    } else {
        charCount.style.color = '#666';
    }
}

function updateLanguageLabels() {
    sourceLabelSpan.textContent = languageMap[sourceSelect.value];
    targetLabelSpan.textContent = languageMap[targetSelect.value];
}

function clearInput() {
    sourceTextArea.value = '';
    resultDiv.innerHTML = '<div class="placeholder">翻译结果将显示在这里...</div>';
    updateCharCount();
}

function copyResult() {
    navigator.clipboard.writeText(resultDiv.textContent).then(() => {
        showMessage('复制成功', 'success');
    });
}

function pasteText() {
    navigator.clipboard.readText().then(text => {
        sourceTextArea.value = text;
        updateCharCount();
    });
}

function swapLanguages() {
    if (sourceSelect.value === 'auto') {
        showMessage('自动检测语言无法交换', 'warning');
        return;
    }

    const tempValue = sourceSelect.value;
    sourceSelect.value = targetSelect.value;
    targetSelect.value = tempValue;

    const targetText = resultDiv.textContent;
    if (targetText && !targetText.includes('翻译结果将显示在这里')) {
        sourceTextArea.value = targetText;
        updateCharCount();
    }
    updateLanguageLabels();
}

function handleVoiceInput() {
    const result = startVoiceInput((transcript) => {
        sourceTextArea.value = transcript;
        updateCharCount();
    });
    if (!result.supported) {
        showMessage('您的浏览器不支持语音识别', 'error');
    } else {
        showMessage('请开始说话...', 'info');
    }
}

function handleSpeak() {
    const result = speakResult();
    const speakerBtn = document.getElementById('speaker-btn');

    if (result.error === 'not-supported') {
        showMessage('您的浏览器不支持语音合成', 'error');
    } else if (result.error === 'no-content') {
        showMessage('没有可朗读的内容', 'warning');
    } else if (result.action === 'started') {
        speakerBtn.innerHTML = '<i class="fas fa-stop"></i>';
        speakerBtn.title = '停止朗读';
    } else if (result.action === 'stopped') {
        speakerBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        speakerBtn.title = '朗读';
    }
}

// --- API 设置 ---

function showApiSettings() {
    const modal = document.getElementById('api-modal-overlay');
    document.getElementById('api-key-input').value = API_CONFIG.apiKey;
    const statusDiv = document.getElementById('api-status');
    statusDiv.className = 'api-status';
    statusDiv.textContent = '';
    modal.classList.add('show');
}

function hideApiSettings() {
    document.getElementById('api-modal-overlay').classList.remove('show');
}

function saveApiKey() {
    const apiKeyInput = document.getElementById('api-key-input');
    const statusDiv = document.getElementById('api-status');
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
        statusDiv.className = 'api-status error';
        statusDiv.textContent = 'API密钥不能为空';
        return;
    }
    if (!apiKey.startsWith('sk-')) {
        statusDiv.className = 'api-status error';
        statusDiv.textContent = 'API密钥格式不正确，应该以"sk-"开头';
        return;
    }

    localStorage.setItem('deepseek_api_key', apiKey);
    API_CONFIG.apiKey = apiKey;

    statusDiv.className = 'api-status success';
    statusDiv.textContent = 'API密钥保存成功！';

    setTimeout(() => {
        hideApiSettings();
        checkApiKeyStatus();
        showMessage('API配置已更新', 'success');
    }, 2000);
}

function checkApiKeyStatus() {
    const apiConfigBtn = document.getElementById('api-settings-btn');
    const apiStatusText = document.getElementById('api-status-text');
    const apiStatusIndicator = document.getElementById('api-status-indicator');
    const useProxy = !!API_CONFIG.proxyURL;

    if (useProxy || API_CONFIG.apiKey) {
        apiConfigBtn.classList.add('configured');
        apiConfigBtn.innerHTML = useProxy
            ? '<i class="fas fa-shield-alt"></i><span>代理已连接</span>'
            : '<i class="fas fa-check-circle"></i><span>API已配置</span>';
        apiConfigBtn.title = useProxy ? '通过安全代理连接' : 'API已配置，点击修改';
        apiStatusText.textContent = useProxy ? '代理模式' : 'API已配置';
        apiStatusIndicator.classList.add('connected');
    } else {
        apiConfigBtn.classList.remove('configured');
        apiConfigBtn.innerHTML = '<i class="fas fa-key"></i><span>配置API</span>';
        apiConfigBtn.title = '点击配置DeepSeek API密钥';
        apiStatusText.textContent = 'API未配置';
        apiStatusIndicator.classList.remove('connected');
        setTimeout(() => {
            showMessage('请先配置DeepSeek API密钥才能使用翻译功能', 'warning');
        }, 1500);
    }
}
