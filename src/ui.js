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
import { isMitraReachable, searchCanonical } from './mitra.js';
import { buildLexiconContext, findLexiconTerms, formatLexiconEntry, getLoadedLexicon, loadLexicon } from './lexicon.js';
import { STYLE_DIMENSIONS, defaultStyle, describeStyle, normalizeStyle } from './style.js';
import { MIN_INTERVAL_MS, renderDocumentMarkdown, translateDocument } from './document.js';
import { initSpeech, startVoiceInput, speakResult } from './speech.js';

// DOM 元素
let sourceTextArea, targetSelect, sourceSelect, translateBtn, resultDiv, charCount;
let sourceLabelSpan, targetLabelSpan;
let engineSelect, styleGrid, styleSummary, multiWitnessToggle, witnessGrid, focusSelect;
let resultMeta, lexiconPanel, provenancePanel, provenanceBtn;
let documentToggle, documentPanel, docChunks, docNote, docProgressFill, docProgressText;
let docContinueBtn, docStopBtn, docExportBtn, modeHint;

let currentStyle = defaultStyle();

const SHORT_TEXT_LIMIT = 5000;
// 整部经模式下输入的是全文，不该再按一框的长度卡。逐块送上游时每块只有几百字。
const DOCUMENT_TEXT_LIMIT = 60000;
// 官方文档：长文翻译最大的失败模式是术语漂移，对策是短反馈环 —— 每几块停一次让人改。
const PAUSE_EVERY_CHUNKS = 5;

/** 一次整部经翻译的运行态。 */
const documentRun = {
    active: false,
    iterator: null,
    entries: [],
    total: 0,
    paused: false,
    stopped: false
};

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
    lexiconPanel = document.getElementById('lexicon-panel');
    provenancePanel = document.getElementById('provenance-panel');
    provenanceBtn = document.getElementById('provenance-btn');

    documentToggle = document.getElementById('document-mode-toggle');
    documentPanel = document.getElementById('document-panel');
    docChunks = document.getElementById('doc-chunks');
    docNote = document.getElementById('doc-note');
    docProgressFill = document.getElementById('doc-progress-fill');
    docProgressText = document.getElementById('doc-progress-text');
    docContinueBtn = document.getElementById('doc-continue');
    docStopBtn = document.getElementById('doc-stop');
    docExportBtn = document.getElementById('doc-export');
    modeHint = document.getElementById('mode-hint');

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
    updateDocumentMode();
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

    if (provenanceBtn) provenanceBtn.addEventListener('click', handleProvenance);
    if (engineSelect) engineSelect.addEventListener('change', updateEngineHint);
    if (multiWitnessToggle) multiWitnessToggle.addEventListener('change', updateWitnessVisibility);
    if (documentToggle) documentToggle.addEventListener('change', updateDocumentMode);
    if (docContinueBtn) docContinueBtn.addEventListener('click', resumeDocumentRun);
    if (docStopBtn) docStopBtn.addEventListener('click', stopDocumentRun);
    if (docExportBtn) docExportBtn.addEventListener('click', exportDocument);
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
    // 两个模式互斥，见 updateDocumentMode 里的说明
    if (enabled && documentToggle?.checked) {
        documentToggle.checked = false;
        updateDocumentMode();
    }

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

// --- 整部经模式 ---

function documentModeEnabled() {
    return Boolean(documentToggle?.checked);
}

function updateDocumentMode() {
    if (!documentPanel) return;

    const enabled = documentModeEnabled();
    // 两个模式互斥：多本合参要的是同一段落的多语种写本，整部经要的是一种语言的全文
    if (enabled && multiWitnessToggle?.checked) {
        multiWitnessToggle.checked = false;
        updateWitnessVisibility();
    }

    documentPanel.hidden = !enabled || documentRun.entries.length === 0;
    if (modeHint) {
        modeHint.textContent = enabled
            ? '整篇粘进来，按句切成小块逐块翻译，并把已译出的上文回喂给下一块，压住术语漂移'
            : '同一段落的梵／巴／汉／藏写本一起送入，得到一份权衡各本的译文';
    }
    if (sourceTextArea) {
        sourceTextArea.placeholder = enabled ? '把整部经的原文粘贴到这里…' : '请输入要翻译的佛教文本...';
    }
    translateBtn.innerHTML = enabled
        ? '<i class="fas fa-book"></i> 逐块翻译'
        : '<i class="fas fa-language"></i> 翻译';
    updateCharCount();
}

function textLimit() {
    return documentModeEnabled() ? DOCUMENT_TEXT_LIMIT : SHORT_TEXT_LIMIT;
}

function resetDocumentRun() {
    documentRun.active = false;
    documentRun.iterator = null;
    documentRun.entries = [];
    documentRun.total = 0;
    documentRun.paused = false;
    documentRun.stopped = false;
    if (docChunks) docChunks.textContent = '';
    if (docNote) docNote.textContent = '';
    setDocButtons({ continue: false, stop: false, export: false });
    updateDocProgress(0, 0);
}

function setDocButtons(state) {
    if (docContinueBtn) docContinueBtn.hidden = !state.continue;
    if (docStopBtn) docStopBtn.hidden = !state.stop;
    if (docExportBtn) docExportBtn.hidden = !state.export;
}

function updateDocProgress(done, total) {
    if (docProgressFill) {
        docProgressFill.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
    }
    if (docProgressText) {
        docProgressText.textContent = total > 0 ? `${done} / ${total} 块` : '';
    }
}

function appendDocChunk(entry, index) {
    if (!docChunks) return;

    const block = document.createElement('div');
    block.className = 'doc-chunk';
    block.innerHTML = `
        <div class="doc-chunk-index">${index + 1}</div>
        <div class="doc-chunk-body">
            <pre class="doc-chunk-source">${escapeHtml(entry.chunk.text)}</pre>
            <div class="doc-chunk-translation">${escapeHtml(entry.translation)}</div>
        </div>
    `;
    docChunks.appendChild(block);
    block.scrollIntoView({ block: 'nearest' });
}

async function handleDocumentTranslate(sourceText, sourceLang, targetLang) {
    resetDocumentRun();
    documentPanel.hidden = false;
    documentRun.active = true;

    // 术语索引在这里一次性备好，逐块查时就不必每块都等加载
    let lexicon = getLoadedLexicon();
    if (!lexicon) {
        try {
            lexicon = await loadLexicon();
        } catch {
            lexicon = null;
        }
    }

    const runner = translateDocument(
        {
            text: sourceText,
            glossaryFor: chunkText => (lexicon ? buildLexiconContext(chunkText, lexicon, { maxTerms: 8 }) : ''),
            registerReminder: describeStyle(currentStyle),
            // 实测上游约 10 次/分钟就限流，不限速的话二三十块的经跑到一半就 429
            minIntervalMs: MIN_INTERVAL_MS
        },
        async ({ chunk, context }) => translateText({
            witnesses: { [sourceLang]: chunk.text },
            sourceLang,
            targetLang,
            style: currentStyle,
            preference: enginePreference(),
            context
        })
    );

    documentRun.iterator = runner;
    await pumpDocumentRun();
}

async function pumpDocumentRun() {
    const runner = documentRun.iterator;
    if (!runner) return;

    setDocButtons({ continue: false, stop: true, export: documentRun.entries.length > 0 });
    translateBtn.disabled = true;
    translateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 逐块翻译中...';

    try {
        while (true) {
            const { value: event, done } = await runner.next();
            if (done || !event) break;

            if (event.type === 'start') {
                documentRun.total = event.total;
                updateDocProgress(0, event.total);
                if (docNote) docNote.textContent = `全文切成 ${event.total} 块，每 ${PAUSE_EVERY_CHUNKS} 块停一次，方便中途改术语。`;
                continue;
            }

            if (event.type === 'retry') {
                // 上游限流不是失败，是要等 —— 让人看得见在等什么、还要等多久
                if (docNote) {
                    docNote.textContent = `第 ${event.index + 1} 块遇到上游限流，`
                        + `${Math.round(event.waitMs / 1000)} 秒后自动重试（第 ${event.attempt}/${event.maxRetries} 次）。`;
                }
                continue;
            }

            if (event.type === 'error') {
                if (docNote) {
                    docNote.textContent = `第 ${event.index + 1} 块失败：${describeTranslationError(event.error)}`;
                }
                showMessage(describeTranslationError(event.error), 'error');
                break;
            }

            if (event.type === 'chunk') {
                documentRun.entries.push({ chunk: event.chunk, translation: event.translation });
                appendDocChunk(event, documentRun.entries.length - 1);
                updateDocProgress(documentRun.entries.length, documentRun.total);
                resultDiv.innerHTML = `<div class="translation-text">${escapeHtml(event.translation)}</div>`;

                const finished = documentRun.entries.length >= documentRun.total;
                if (!finished && documentRun.entries.length % PAUSE_EVERY_CHUNKS === 0) {
                    documentRun.paused = true;
                    break;
                }
                continue;
            }

            if (event.type === 'done') {
                if (docNote) docNote.textContent = `全部 ${event.total} 块译完。`;
                showMessage('整部翻译完成', 'success');
                break;
            }
        }
    } catch (error) {
        console.error('整部经翻译出错:', error);
        showMessage('翻译失败: ' + error.message, 'error');
    } finally {
        translateBtn.disabled = false;
        updateDocumentMode();

        const hasResults = documentRun.entries.length > 0;
        const finished = documentRun.total > 0 && documentRun.entries.length >= documentRun.total;
        setDocButtons({
            continue: documentRun.paused && !documentRun.stopped && !finished,
            stop: false,
            export: hasResults
        });
        if (documentRun.paused && !finished && docNote) {
            docNote.textContent = `已译 ${documentRun.entries.length} / ${documentRun.total} 块。`
                + '这里停一下：看看术语对不对，要调就改译风设置再继续。';
        }
        documentRun.active = documentRun.paused && !finished;
    }
}

async function resumeDocumentRun() {
    if (!documentRun.iterator || documentRun.stopped) return;
    documentRun.paused = false;
    await pumpDocumentRun();
}

async function stopDocumentRun() {
    documentRun.stopped = true;
    documentRun.paused = false;
    if (documentRun.iterator?.return) {
        await documentRun.iterator.return();
    }
    documentRun.iterator = null;
    documentRun.active = false;
    setDocButtons({ continue: false, stop: false, export: documentRun.entries.length > 0 });
    if (docNote) {
        docNote.textContent = `已停止，保留了前 ${documentRun.entries.length} 块的译文，可以导出。`;
    }
}

function exportDocument() {
    if (documentRun.entries.length === 0) {
        showMessage('还没有可导出的译文', 'warning');
        return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const markdown = renderDocumentMarkdown(documentRun.entries, {
        title: `整部翻译 ${dateStamp}`,
        engine: resultMeta && !resultMeta.hidden ? resultMeta.textContent : '',
        style: describeStyle(currentStyle)
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buddhist-document-${dateStamp}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showMessage('对照稿已导出', 'success');
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

    if (documentModeEnabled()) {
        await handleDocumentTranslate(sourceText, sourceLang, targetLang);
        return;
    }

    translateBtn.disabled = true;
    hideProvenance();

    try {
        translateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 翻译中...';

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
            await showLexiconPanel(sourceText);
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
        translateBtn.innerHTML = '<i class="fas fa-language"></i> 翻译';
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

// --- 术语对照 ---

async function showLexiconPanel(text) {
    if (!lexiconPanel) return;

    let lexicon = getLoadedLexicon();
    if (!lexicon) {
        try {
            lexicon = await loadLexicon();
        } catch {
            lexiconPanel.hidden = true;
            return;
        }
    }

    const matches = findLexiconTerms(text, lexicon, { limit: 12 });
    if (matches.length === 0) {
        lexiconPanel.hidden = true;
        return;
    }

    const rows = matches.map(entry => {
        const witnesses = (entry.src || []).join('、');
        return `<li><span class="lexicon-term">${escapeHtml(formatLexiconEntry(entry))}</span>`
            + `<span class="lexicon-meta">${escapeHtml(`${entry.n} 次${witnesses ? ` · ${witnesses}` : ''}`)}</span></li>`;
    }).join('');

    lexiconPanel.innerHTML = `
        <div class="panel-title"><i class="fas fa-language"></i> 本文术语的实证对照</div>
        <ul class="lexicon-list">${rows}</ul>
        <p class="panel-note">对照数据来自平行语料实际出现的对译，未逐条人工审定；次数越高越可靠。</p>
    `;
    lexiconPanel.hidden = false;
}

// --- 藏经溯源 ---

function hideProvenance() {
    if (provenancePanel) {
        provenancePanel.hidden = true;
        provenancePanel.textContent = '';
    }
}

async function handleProvenance() {
    if (!provenancePanel) return;

    const text = validateInput(sourceTextArea.value.trim());
    if (!text) {
        showMessage('请先输入要溯源的原文', 'warning');
        return;
    }

    if (!isMitraReachable()) {
        provenancePanel.hidden = false;
        provenancePanel.innerHTML = '<div class="panel-title"><i class="fas fa-book-open"></i> 藏经溯源</div>'
            + '<p class="panel-note">藏经检索需要先部署 Worker 中转（见 worker/README.md）。'
            + '浏览器暂时无法直连 Dharmamitra —— 对方在实际响应里重复发送了 CORS 头。</p>';
        return;
    }

    provenanceBtn.disabled = true;
    provenancePanel.hidden = false;
    provenancePanel.innerHTML = '<div class="panel-title"><i class="fas fa-spinner fa-spin"></i> 正在藏经语料中检索…</div>';

    try {
        const hits = await searchCanonical({ text, sourceLang: sourceSelect.value });
        if (hits.length === 0) {
            provenancePanel.innerHTML = '<div class="panel-title"><i class="fas fa-book-open"></i> 藏经溯源</div>'
                + '<p class="panel-note">语料中没有检索到这段文字。可能是现代文、意引，或不在已收录的范围内。</p>';
            return;
        }

        const rows = hits.map(hit => {
            const title = escapeHtml(hit.title || hit.source || '未题');
            const snippet = escapeHtml(hit.text.slice(0, 120));
            const segment = escapeHtml(hit.segmentnr);
            const link = hit.link
                ? `<a href="${escapeHtml(hit.link)}" target="_blank" rel="noopener noreferrer">查看原文</a>`
                : '';
            return `<li><div class="prov-title">${title} <span class="prov-seg">${segment}</span></div>`
                + `<div class="prov-text">${snippet}</div><div class="prov-link">${link}</div></li>`;
        }).join('');

        provenancePanel.innerHTML = `
            <div class="panel-title"><i class="fas fa-book-open"></i> 藏经溯源（${hits.length} 条）</div>
            <ul class="provenance-list">${rows}</ul>
            <p class="panel-note">检索与深链由 Dharmamitra 语料库提供。</p>
        `;
    } catch (error) {
        provenancePanel.innerHTML = '<div class="panel-title"><i class="fas fa-book-open"></i> 藏经溯源</div>'
            + `<p class="panel-note">${escapeHtml(describeTranslationError(error))}</p>`;
    } finally {
        provenanceBtn.disabled = false;
    }
}

// --- 工具函数 ---

function updateCharCount() {
    const limit = textLimit();
    const limited = limitTextLength(sourceTextArea.value, limit);
    if (limited.truncated) {
        sourceTextArea.value = limited.text;
    }

    charCount.textContent = `${limited.length} / ${limit}`;
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
    if (lexiconPanel) lexiconPanel.hidden = true;
    hideProvenance();
    resetDocumentRun();
    if (documentPanel) documentPanel.hidden = true;
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
        speakerBtn.innerHTML = '<i class="fas fa-stop"></i>';
        speakerBtn.title = '停止朗读';
    } else {
        speakerBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
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
            ? '<i class="fas fa-shield-alt"></i><span>代理已连接</span>'
            : '<i class="fas fa-check-circle"></i><span>API已配置</span>';
        apiConfigBtn.title = useProxy ? '通过安全代理连接' : 'API已配置，点击修改';
    } else {
        apiConfigBtn.classList.remove('configured');
        apiConfigBtn.innerHTML = '<i class="fas fa-key"></i><span>配置API</span>';
        apiConfigBtn.title = '可选：配置 DeepSeek 密钥以支持 MITRA 不受理的语种对';
    }

    updateEngineHint();
}
