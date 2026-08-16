import { API_CONFIG, languageMap, storeApiKey, storeProxyURL, isValidProxyURL, hasProxyURL } from './config.js';
import { escapeHtml, limitTextLength, validateInput, showMessage } from './utils.js';
import {
    ENGINES,
    ENGINE_LABELS,
    describeTranslationError,
    hasDeepSeekCredentials,
    mitraBlockedByDeployment,
    selectEngine,
    translateText,
    translateWithBuiltIn
} from './translator.js';
import { STYLE_DIMENSIONS, defaultStyle, describeStyle, normalizeStyle } from './style.js';
import { describeWitnessMiss, fetchWitnesses } from './witnesses.js';
import { initSpeech, startVoiceInput, speakResult } from './speech.js';

// DOM 元素
let sourceTextArea, targetSelect, sourceSelect, translateBtn, resultDiv, charCount;
let sourceLabelSpan, targetLabelSpan;
let engineSelect, styleGrid, styleSummary, multiWitnessToggle, witnessGrid, focusSelect;
let resultMeta, autofillBtn, autofillStatus;

let currentStyle = defaultStyle();

const WITNESS_INPUTS = [
    { lang: 'sa', id: 'witness-sa' },
    { lang: 'pi', id: 'witness-pi' },
    { lang: 'zh-classical', id: 'witness-zh' },
    { lang: 'bo', id: 'witness-bo' }
];

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

    engineSelect = document.getElementById('engine-select');
    styleGrid = document.getElementById('style-grid');
    styleSummary = document.getElementById('style-summary');
    multiWitnessToggle = document.getElementById('multi-witness-toggle');
    witnessGrid = document.getElementById('witness-grid');
    focusSelect = document.getElementById('focus-select');
    resultMeta = document.getElementById('result-meta');
    autofillBtn = document.getElementById('autofill-witnesses');
    autofillStatus = document.getElementById('autofill-status');

    // 初始化语音模块
    initSpeech(
        () => targetSelect.value,
        () => resultDiv,
        updateSpeakerButton
    );

    renderStyleControls();
    bindEvents();
    updateLanguageLabels();
    updateCharCount();
    checkApiKeyStatus();
    updateWitnessVisibility();
    updateEngineHint();
}

function bindEvents() {
    translateBtn.addEventListener('click', handleTranslate);
    sourceTextArea.addEventListener('input', updateCharCount);
    sourceSelect.addEventListener('change', updateLanguageLabels);
    targetSelect.addEventListener('change', updateLanguageLabels);
    document.addEventListener('keydown', handleKeyboardShortcuts);

    document.getElementById('clear-input').addEventListener('click', clearInput);
    document.getElementById('copy-btn').addEventListener('click', copyResult);
    document.getElementById('download-btn').addEventListener('click', downloadResult);
    document.getElementById('voice-input').addEventListener('click', handleVoiceInput);
    document.getElementById('speaker-btn').addEventListener('click', handleSpeak);
    document.getElementById('paste-btn').addEventListener('click', pasteText);
    document.getElementById('swap-btn').addEventListener('click', swapLanguages);

    if (engineSelect) engineSelect.addEventListener('change', updateEngineHint);
    if (autofillBtn) autofillBtn.addEventListener('click', handleAutofillWitnesses);
    if (multiWitnessToggle) multiWitnessToggle.addEventListener('change', updateWitnessVisibility);
    if (sourceSelect) sourceSelect.addEventListener('change', updateWitnessVisibility);
    if (sourceSelect) sourceSelect.addEventListener('change', updateEngineHint);
    if (targetSelect) targetSelect.addEventListener('change', updateEngineHint);

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

// --- 译风设置 ---

function renderStyleControls() {
    if (!styleGrid) return;

    styleGrid.textContent = '';
    for (const [key, spec] of Object.entries(STYLE_DIMENSIONS)) {
        const wrapper = document.createElement('div');
        wrapper.className = 'style-field';

        const label = document.createElement('label');
        label.setAttribute('for', `style-${key}`);
        label.textContent = spec.label;

        const select = document.createElement('select');
        select.id = `style-${key}`;
        select.className = 'lang-select';
        select.dataset.styleKey = key;
        for (const option of spec.options) {
            const node = document.createElement('option');
            node.value = option.value;
            node.textContent = option.label;
            if (option.value === spec.default) node.selected = true;
            select.appendChild(node);
        }
        select.addEventListener('change', handleStyleChange);

        wrapper.appendChild(label);
        wrapper.appendChild(select);
        styleGrid.appendChild(wrapper);
    }

    updateStyleSummary();
}

function handleStyleChange(event) {
    const key = event.target.dataset.styleKey;
    if (!key) return;
    currentStyle = normalizeStyle({ ...currentStyle, [key]: event.target.value });
    updateStyleSummary();
}

function updateStyleSummary() {
    if (styleSummary) styleSummary.textContent = describeStyle(currentStyle);
}

// --- 多本合参 ---

function multiWitnessEnabled() {
    return Boolean(multiWitnessToggle?.checked);
}

function updateWitnessVisibility() {
    if (!witnessGrid) return;

    const enabled = multiWitnessEnabled();
    witnessGrid.hidden = !enabled;
    if (!enabled) return;

    // 主输入框已经承担了源语言那一路写本，这里就不再重复给一个框。
    const primary = sourceSelect.value;
    for (const { lang } of WITNESS_INPUTS) {
        const field = witnessGrid.querySelector(`.witness-field[data-lang="${lang}"]`);
        if (field) field.hidden = lang === primary;
    }
}

function collectWitnesses(primaryText) {
    const witnesses = {};
    const primaryLang = sourceSelect.value;
    if (primaryText) witnesses[primaryLang] = primaryText;

    if (!multiWitnessEnabled()) return witnesses;

    for (const { lang, id } of WITNESS_INPUTS) {
        if (lang === primaryLang) continue;
        const value = document.getElementById(id)?.value?.trim();
        if (!value) continue;
        const clean = validateInput(value);
        if (clean) witnesses[lang] = clean;
    }
    return witnesses;
}

// --- 引擎提示 ---

function enginePreference() {
    return engineSelect?.value || 'auto';
}

function updateEngineHint() {
    const hint = document.getElementById('api-status-text');
    if (!hint) return;

    const text = sourceTextArea?.value || '';
    const request = {
        sourceLang: sourceSelect.value,
        targetLang: targetSelect.value,
        text
    };

    // 还没输入且源语言是自动检测时，判不出写本语言，别急着报一个会误导人的引擎。
    if (!text.trim() && sourceSelect.value === 'auto') {
        hint.textContent = '自动选择 · 输入原文后判定';
        return;
    }

    const engine = selectEngine({ ...request, preference: enginePreference() });

    if (engine === ENGINES.MITRA) {
        hint.textContent = 'MITRA · 免密钥';
        return;
    }
    if (mitraBlockedByDeployment(request)) {
        hint.textContent = 'MITRA 需先部署 Worker 中转';
        return;
    }
    hint.textContent = hasDeepSeekCredentials() ? 'DeepSeek · 已配置' : 'DeepSeek · 待配置密钥';
}

// --- 翻译 ---

async function handleTranslate() {
    if (translateBtn.disabled) {
        return;
    }

    const rawText = sourceTextArea.value.trim();
    if (!rawText) {
        showMessage('请输入要翻译的文本', 'warning');
        return;
    }

    const sourceText = validateInput(rawText);
    if (sourceText !== rawText) {
        showMessage('检测到不安全内容，已自动清理', 'warning');
    }
    if (!sourceText) {
        showMessage('请输入有效的翻译文本', 'warning');
        return;
    }

    const sourceLang = sourceSelect.value;
    const targetLang = targetSelect.value;

    if (sourceLang === targetLang && sourceLang !== 'auto') {
        showMessage('源语言和目标语言不能相同', 'warning');
        return;
    }

    translateBtn.disabled = true;

    try {
        translateBtn.innerHTML = '<svg class="icon icon-spin" aria-hidden="true"><use href="#i-spinner"></use></svg> 翻译中...';

        try {
            const outcome = await translateText({
                witnesses: collectWitnesses(sourceText),
                sourceLang,
                targetLang,
                style: currentStyle,
                focusLang: multiWitnessEnabled() ? (focusSelect?.value || '') : '',
                preference: enginePreference()
            });
            resultDiv.innerHTML = `<div class="translation-text">${escapeHtml(outcome.text)}</div>`;
            showResultMeta(outcome);
            if (outcome.fromCache) showMessage('使用缓存结果，响应更快！', 'success');
        } catch (apiError) {
            console.warn('API翻译失败，使用内置翻译:', apiError.message);
            const result = translateWithBuiltIn(sourceText, sourceLang, targetLang);
            resultDiv.innerHTML = `<div class="translation-text">${escapeHtml(result)}</div>`;
            showResultMeta({ engine: ENGINES.BUILTIN, fromCache: false, lexiconTerms: 0 });
            showMessage(describeTranslationError(apiError), 'warning');
        }
    } catch (error) {
        console.error('翻译错误:', error);
        resultDiv.innerHTML = '<div class="error">翻译失败，请稍后重试</div>';
        showMessage('翻译失败: ' + error.message, 'error');
    } finally {
        translateBtn.disabled = false;
        translateBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-language"></use></svg> 翻译';
    }
}

function showResultMeta(outcome) {
    if (!resultMeta) return;

    const parts = [ENGINE_LABELS[outcome.engine] || outcome.engine];
    if (outcome.fromCache) parts.push('缓存命中');
    if (outcome.lexiconTerms > 0) parts.push(`已注入 ${outcome.lexiconTerms} 条实证术语`);

    resultMeta.textContent = parts.join(' · ');
    resultMeta.hidden = false;
}

/*
 * 自动取回平行本。
 *
 * 覆盖率行级密度中位数只有 16%，「取不到」是常态而不是异常——所以每种失败
 * 都要说清楚是哪一种，绝不能只留三个空着的输入框让人猜是自己贴错了还是语料没有。
 */
async function handleAutofillWitnesses() {
    if (!autofillBtn || autofillBtn.disabled) return;

    const passage = validateInput(sourceTextArea.value.trim());
    if (!passage) {
        setAutofillStatus('请先在左边贴入要取平行本的汉文原文。');
        return;
    }

    autofillBtn.disabled = true;
    setAutofillStatus('正在藏经语料中定位…');

    try {
        const outcome = await fetchWitnesses(passage);

        if (!outcome.found) {
            setAutofillStatus(describeWitnessMiss(outcome.reason, outcome.source));
            return;
        }

        const filled = [];
        for (const { lang, id } of WITNESS_INPUTS) {
            const text = outcome.witnesses[lang];
            if (!text) continue;
            const field = document.getElementById(id);
            if (!field) continue;
            field.value = text;
            filled.push(lang);
        }

        const where = outcome.source?.title
            ? `《${outcome.source.title}》卷${outcome.source.juan}`
            : '藏经语料';
        setAutofillStatus(`已从 ${where} 取回 ${filled.length} 路写本（${filled.join('、')}）。`);
    } catch (error) {
        setAutofillStatus(describeWitnessMiss('failed'));
        console.warn('平行本取回失败:', error.message);
    } finally {
        autofillBtn.disabled = false;
    }
}

function setAutofillStatus(message) {
    if (autofillStatus) autofillStatus.textContent = message;
}

// --- 工具函数 ---

function updateCharCount() {
    const limited = limitTextLength(sourceTextArea.value, 5000);
    if (limited.truncated) {
        sourceTextArea.value = limited.text;
    }

    charCount.textContent = `${limited.length} / 5000`;
    if (limited.truncated) {
        charCount.style.color = '#e74c3c';
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
    if (resultMeta) resultMeta.hidden = true;
    updateCharCount();
}

function copyResult() {
    const translationText = resultDiv.querySelector('.translation-text');
    if (!translationText) {
        showMessage('没有可复制的翻译结果', 'warning');
        return;
    }

    navigator.clipboard.writeText(translationText.textContent).then(() => {
        showMessage('复制成功', 'success');
    }).catch(() => {
        showMessage('复制失败，请检查剪贴板权限', 'error');
    });
}

function downloadResult() {
    const translationText = resultDiv.querySelector('.translation-text');
    if (!translationText) {
        showMessage('没有可下载的翻译结果', 'warning');
        return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const exportText = [
        '慧译通 Buddhist AI Translator',
        `导出日期: ${dateStamp}`,
        `源语言: ${languageMap[sourceSelect.value] || sourceSelect.value}`,
        `目标语言: ${languageMap[targetSelect.value] || targetSelect.value}`,
        `翻译引擎: ${resultMeta && !resultMeta.hidden ? resultMeta.textContent : '未知'}`,
        `译风: ${describeStyle(currentStyle)}`,
        '',
        '原文:',
        sourceTextArea.value.trim(),
        '',
        '译文:',
        translationText.textContent.trim()
    ].join('\n');
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'buddhist-translation-' + dateStamp + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showMessage('译文已下载', 'success');
}

function pasteText() {
    navigator.clipboard.readText().then(text => {
        sourceTextArea.value = text;
        updateCharCount();
    }).catch(() => {
        showMessage('无法读取剪贴板，请检查浏览器权限', 'error');
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

    const translationText = resultDiv.querySelector('.translation-text');
    if (translationText) {
        sourceTextArea.value = translationText.textContent;
        updateCharCount();
    }
    updateLanguageLabels();
    updateWitnessVisibility();
    updateEngineHint();
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

    if (result.error === 'not-supported') {
        showMessage('您的浏览器不支持语音合成', 'error');
    } else if (result.error === 'no-content') {
        showMessage('没有可朗读的内容', 'warning');
    } else if (result.action === 'started') {
        updateSpeakerButton(true);
    } else if (result.action === 'stopped') {
        updateSpeakerButton(false);
    }
}

function updateSpeakerButton(speaking) {
    const speakerBtn = document.getElementById('speaker-btn');
    if (!speakerBtn) return;

    if (speaking) {
        speakerBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-stop"></use></svg>';
        speakerBtn.title = '停止朗读';
    } else {
        speakerBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-volume"></use></svg>';
        speakerBtn.title = '朗读';
    }
}

// --- API 设置 ---

function showApiSettings() {
    const modal = document.getElementById('api-modal-overlay');
    document.getElementById('api-key-input').value = API_CONFIG.apiKey;
    const proxyInput = document.getElementById('proxy-url-input');
    if (proxyInput) proxyInput.value = API_CONFIG.proxyURLOverride || API_CONFIG.proxyURL || '';
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
    const proxyInput = document.getElementById('proxy-url-input');
    const statusDiv = document.getElementById('api-status');
    const apiKey = apiKeyInput.value.trim();
    const proxyURL = proxyInput ? proxyInput.value.trim() : '';

    // 中转地址是可选的，但填了就必须填对——填错会让 MITRA 静默不可用。
    if (proxyURL && !isValidProxyURL(proxyURL)) {
        statusDiv.className = 'api-status error';
        statusDiv.textContent = '中转地址必须是完整的 https 地址';
        return;
    }
    if (!apiKey && !proxyURL) {
        statusDiv.className = 'api-status error';
        statusDiv.textContent = '请至少填写 Worker 中转地址或 DeepSeek 密钥';
        return;
    }
    if (apiKey && !apiKey.startsWith('sk-')) {
        statusDiv.className = 'api-status error';
        statusDiv.textContent = 'API密钥格式不正确，应该以"sk-"开头';
        return;
    }

    const proxyPersisted = storeProxyURL(proxyURL);
    const keyPersisted = apiKey ? storeApiKey(apiKey) : true;
    const persisted = proxyPersisted && keyPersisted;

    statusDiv.className = 'api-status success';
    statusDiv.textContent = persisted
        ? '设置保存成功！'
        : '设置已在当前会话生效，但无法保存到本地存储。';

    setTimeout(() => {
        hideApiSettings();
        checkApiKeyStatus();
        showMessage(persisted ? 'API配置已更新' : 'API配置已在当前会话生效', 'success');
    }, 2000);
}

function checkApiKeyStatus() {
    const apiConfigBtn = document.getElementById('api-settings-btn');
    const apiStatusIndicator = document.getElementById('api-status-indicator');
    const useProxy = hasProxyURL();

    // MITRA 不需要密钥，所以指示灯代表的是「能不能翻译」，而不是「有没有 DeepSeek 密钥」。
    apiStatusIndicator.classList.add('connected');

    if (useProxy || API_CONFIG.apiKey) {
        apiConfigBtn.classList.add('configured');
        apiConfigBtn.innerHTML = useProxy
            ? '<svg class="icon" aria-hidden="true"><use href="#i-shield"></use></svg><span>代理已连接</span>'
            : '<svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg><span>API已配置</span>';
        apiConfigBtn.title = useProxy ? '通过安全代理连接' : 'API已配置，点击修改';
    } else {
        apiConfigBtn.classList.remove('configured');
        apiConfigBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-key"></use></svg><span>配置API</span>';
        apiConfigBtn.title = '可选：配置 DeepSeek 密钥以支持 MITRA 不受理的语种对';
    }

    updateEngineHint();
}
