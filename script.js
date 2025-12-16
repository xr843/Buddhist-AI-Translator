// API设置
const API_CONFIG = {
    provider: 'deepseek',
    apiKey: localStorage.getItem('deepseek_api_key') || '',
    baseURL: 'https://api.deepseek.com/v1/chat/completions'
};

// 语言映射
const languageMap = {
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

// 佛教术语数据库
const buddhistTerms = {
    // 心经内容
    '般若波罗蜜多心经': 'The Heart of the Perfection of Wisdom Sutra / प्रज्ञापारमिताहृदयसूत्र',
    '观自在菩萨': 'Avalokiteshvara Bodhisattva / अवलोकितेश्वर बोधिसत्त्व',
    '行深般若波罗蜜多时': 'When practicing the deep Perfection of Wisdom / गम्भीर प्रज्ञापारमिता अभ्यास करते समय',
    '照见五蕴皆空': 'perceived that all five aggregates are empty / पञ्चस्कन्धों की शून्यता को देखा',
    '度一切苦厄': 'transcended all suffering and distress / सभी दुःख और संकट से मुक्त हो गए',
    '舍利子': 'Shariputra / शारिपुत्र',
    '色不异空': 'form is not different from emptiness / रूप शून्यता से भिन्न नहीं',
    '空不异色': 'emptiness is not different from form / शून्यता रूप से भिन्न नहीं',
    '色即是空': 'form is emptiness / रूप ही शून्यता है',
    '空即是色': 'emptiness is form / शून्यता ही रूप है',
    '受想行识': 'sensation, perception, mental formations, and consciousness / वेदना, संज्ञा, संस्कार, और विज्ञान',
    '亦复如是': 'are also like this / भी इसी प्रकार हैं',
    
    // 基础佛教概念
    '佛': 'Buddha / बुद्ध',
    '法': 'Dharma / धर्म',
    '僧': 'Sangha / संघ',
    '三宝': 'Three Jewels (Buddha, Dharma, Sangha) / त्रिरत्न',
    '四谛': 'Four Noble Truths / चत्वारि आर्यसत्यानि',
    '八正道': 'Noble Eightfold Path / आर्याष्टाङ्गिकमार्ग',
    '苦': 'suffering / दुःख',
    '集': 'origin of suffering / समुदय',
    '灭': 'cessation of suffering / निरोध',
    '道': 'path to cessation / मार्ग',
    '无常': 'impermanence / अनित्य',
    '无我': 'non-self / अनात्मन्',
    '涅槃': 'Nirvana / निर्वाण',
    '轮回': 'samsara / संसार',
    '业': 'karma / कर्म',
    '菩萨': 'Bodhisattva / बोधिसत्त्व',
    '阿罗汉': 'Arhat / अर्हत्',
    '如来': 'Tathagata / तथागत',
    '慈悲': 'compassion / करुणा',
    '智慧': 'wisdom / प्रज्ञा',
    '禅定': 'meditation / ध्यान',
    '戒律': 'precepts / शील',
    
    // 唯识学派术语
    '阿赖耶识': 'Alaya-vijnana (store consciousness) / आलयविज्ञान',
    '八识': 'Eight Consciousnesses / अष्टविज्ञान',
    '转识成智': 'transformation of consciousness into wisdom / विज्ञानपरिवृत्तिज्ञान',
    '三性': 'Three Natures / त्रिस्वभाव',
    '遍计所执性': 'parikalpita (imagined nature) / परिकल्पितस्वभाव',
    '依他起性': 'paratantra (dependent nature) / परतन्त्रस्वभाव',
    '圆成实性': 'parinispanna (perfected nature) / परिनिष्पन्नस्वभाव',
    
    // 中观学派术语
    '中道': 'Middle Way / मध्यमप्रतिपद्',
    '空性': 'emptiness / शून्यता',
    '缘起': 'dependent origination / प्रतीत्यसमुत्पाद',
    '二谛': 'Two Truths / द्वयसत्य',
    '世俗谛': 'conventional truth / संवृतिसत्य',
    '胜义谛': 'ultimate truth / परमार्थसत्य',
    
    // 净土宗术语
    '阿弥陀佛': 'Amitabha Buddha / अमिताभ बुद्ध',
    '极乐世界': 'Pure Land / सुखावती',
    '念佛': 'Buddha recitation / बुद्धानुस्मृति',
    '往生': 'rebirth in Pure Land / उत्पत्ति',
    
    // 禅宗术语
    '顿悟': 'sudden enlightenment / सहसाबोधि',
    '明心见性': 'seeing one\'s true nature / स्वभावदर्शन',
    '不立文字': 'not established in words and letters / अक्षरानवस्थापन',
    '直指人心': 'directly pointing to the human mind / प्रत्यक्षचित्तनिर्देश'
};

// DOM元素
let sourceTextArea, targetSelect, sourceSelect, translateBtn, resultDiv, charCount;
let sourceLabelSpan, targetLabelSpan;

// 语音相关
let recognition, synthesis;
let availableVoices = [];
let selectedVoice = null;

// 翻译缓存
const translationCache = new Map();
const MAX_CACHE_SIZE = 100; // 最大缓存条目数

// 生成缓存键
function getCacheKey(text, sourceLang, targetLang) {
    return `${sourceLang}->${targetLang}:${text.trim()}`;
}

// 清理缓存（LRU策略）
function cleanCache() {
    if (translationCache.size >= MAX_CACHE_SIZE) {
        const firstKey = translationCache.keys().next().value;
        translationCache.delete(firstKey);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    initializeVoice();
    bindEvents();
    updateLanguageLabels();
});

function initializeElements() {
    sourceTextArea = document.getElementById('source-text');
    targetSelect = document.getElementById('target-lang');
    sourceSelect = document.getElementById('source-lang');
    translateBtn = document.getElementById('translate-btn');
    resultDiv = document.getElementById('translation-result');
    charCount = document.querySelector('.char-count');
    sourceLabelSpan = document.getElementById('source-label');
    targetLabelSpan = document.getElementById('target-label');
}

function initializeVoice() {
    // 语音识别
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'zh-CN';
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            sourceTextArea.value = transcript;
            updateCharCount();
        };
    }
    
    // 语音合成
    if ('speechSynthesis' in window) {
        synthesis = window.speechSynthesis;
        
        // 加载可用语音列表
        loadAvailableVoices();
        
        // 监听语音列表变化（某些浏览器需要异步加载）
        if (synthesis.onvoiceschanged !== undefined) {
            synthesis.onvoiceschanged = loadAvailableVoices;
        }
    }
}

function loadAvailableVoices() {
    availableVoices = synthesis.getVoices();
    console.log('可用语音数量:', availableVoices.length);
    
    if (availableVoices.length > 0) {
        console.log('语音引擎加载完成');
    } else {
        console.log('等待语音引擎加载...');
    }
}

function bindEvents() {
    // 翻译按钮
    translateBtn.addEventListener('click', handleTranslate);
    
    // 文本输入
    sourceTextArea.addEventListener('input', updateCharCount);
    
    // 语言选择
    sourceSelect.addEventListener('change', updateLanguageLabels);
    targetSelect.addEventListener('change', updateLanguageLabels);
    
    // 工具按钮
    document.getElementById('clear-input').addEventListener('click', clearInput);
    document.getElementById('copy-btn').addEventListener('click', copyResult);
    document.getElementById('voice-input').addEventListener('click', startVoiceInput);
    document.getElementById('speaker-btn').addEventListener('click', speakResult);
    document.getElementById('paste-btn').addEventListener('click', pasteText);
    document.getElementById('swap-btn').addEventListener('click', swapLanguages);
    
    // API设置相关事件
    document.getElementById('api-settings-btn').addEventListener('click', showApiSettings);
    document.getElementById('modal-close').addEventListener('click', hideApiSettings);
    document.getElementById('cancel-btn').addEventListener('click', hideApiSettings);
    document.getElementById('save-api-key').addEventListener('click', saveApiKey);
    
    // 点击模态框外部关闭
    document.getElementById('api-modal-overlay').addEventListener('click', function(e) {
        if (e.target === this) {
            hideApiSettings();
        }
    });
    
    // 检查API密钥状态
    checkApiKeyStatus();
}

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
    const sourceLang = sourceSelect.value;
    const targetLang = targetSelect.value;
    
    sourceLabelSpan.textContent = languageMap[sourceLang];
    targetLabelSpan.textContent = languageMap[targetLang];
}

function clearInput() {
    sourceTextArea.value = '';
    resultDiv.innerHTML = '<div class="placeholder">翻译结果将显示在这里...</div>';
    updateCharCount();
}

function copyResult() {
    const resultText = resultDiv.textContent;
    navigator.clipboard.writeText(resultText).then(() => {
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
    
    // 交换文本
    const sourceText = sourceTextArea.value;
    const targetText = resultDiv.textContent;
    
    if (targetText && !targetText.includes('翻译结果将显示在这里')) {
        sourceTextArea.value = targetText;
        updateCharCount();
    }
    
    updateLanguageLabels();
}

function startVoiceInput() {
    if (!recognition) {
        showMessage('您的浏览器不支持语音识别', 'error');
        return;
    }
    
    recognition.start();
    showMessage('请开始说话...', 'info');
}

// 朗读状态管理
let currentSpeaking = false;
let currentUtterance = null;
let speakingSegments = [];
let currentSegmentIndex = 0;

function speakResult() {
    if (!synthesis) {
        showMessage('您的浏览器不支持语音合成', 'error');
        return;
    }
    
    const text = resultDiv.textContent;
    if (!text || text.includes('翻译结果将显示在这里')) {
        showMessage('没有可朗读的内容', 'warning');
        return;
    }

    // 如果正在朗读，则停止
    if (currentSpeaking) {
        console.log('正在停止当前朗读');
        stopSpeaking();
        return;
    }

    // 确保语音合成器处于空闲状态
    if (synthesis.speaking) {
        console.log('等待语音合成器停止');
        synthesis.cancel();
        setTimeout(() => {
            if (!synthesis.speaking) {
                startSpeaking(text);
            }
        }, 100);
    } else {
        // 开始新的朗读
        startSpeaking(text);
    }
}

function startSpeaking(text) {
    console.log('开始朗读，原始文本：', text);
    
    // 清理并获取纯文本
    const cleanText = text.replace(/^\s*翻译结果：?\s*/, '').trim();
    console.log('清理后文本：', cleanText);
    
    // 选择并固定语音引擎
    selectedVoice = selectBestVoiceForLanguage(targetSelect.value);
    if (!selectedVoice) {
        showMessage('没有找到合适的语音引擎', 'warning');
        return;
    }
    
    console.log('选择的语音引擎:', selectedVoice.name, '语言:', selectedVoice.lang);
    
    // 将文本分段
    speakingSegments = segmentTextForSpeech(cleanText);
    console.log('分段完成，共', speakingSegments.length, '段');
    
    if (speakingSegments.length === 0) {
        showMessage('没有可朗读的内容', 'warning');
        return;
    }
    
    // 重置状态
    currentSegmentIndex = 0;
    currentSpeaking = true;
    
    // 更新朗读按钮状态
    const speakerBtn = document.getElementById('speaker-btn');
    speakerBtn.innerHTML = '<i class="fas fa-stop"></i>';
    speakerBtn.title = '停止朗读';
    
    // 立即显示第一段的高亮
    highlightSpeechSegment(0);
    
    // 立即开始朗读，保持流畅
    setTimeout(() => {
        if (currentSpeaking) {
            speakNextSegment();
        }
    }, 50);
}

function stopSpeaking() {
    currentSpeaking = false;
    
    // 安全地取消语音合成
    try {
        if (synthesis.speaking) {
            synthesis.cancel();
        }
    } catch (error) {
        console.log('停止语音合成时出错:', error);
    }
    
    // 清理当前朗读实例
    if (currentUtterance) {
        currentUtterance = null;
    }
    
    // 清理选择的语音
    selectedVoice = null;
    
    // 恢复按钮状态
    const speakerBtn = document.getElementById('speaker-btn');
    speakerBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    speakerBtn.title = '朗读';
    
    // 清除高亮显示
    clearSpeechHighlight();
}

function speakNextSegment() {
    if (!currentSpeaking || currentSegmentIndex >= speakingSegments.length) {
        console.log('朗读完成或已停止');
        stopSpeaking();
        return;
    }
    
    const segment = speakingSegments[currentSegmentIndex];
    console.log(`开始朗读第 ${currentSegmentIndex + 1} 段：`, segment.text);
    
    // 立即更新高亮显示
    highlightSpeechSegment(currentSegmentIndex);
    
    // 创建语音合成实例
    currentUtterance = new SpeechSynthesisUtterance(segment.text);
    
    // 使用固定的语音引擎
    if (selectedVoice) {
        currentUtterance.voice = selectedVoice;
        currentUtterance.lang = selectedVoice.lang;
    } else {
        currentUtterance.lang = getVoiceLang(targetSelect.value);
    }
    
    currentUtterance.rate = 1.0;  // 使用正常语速，更自然
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;
    
    // 朗读开始事件
    currentUtterance.onstart = () => {
        console.log(`语音开始：第 ${currentSegmentIndex + 1} 段`);
        if (currentSpeaking) {
            // 确保高亮同步
            highlightSpeechSegment(currentSegmentIndex);
        }
    };
    
    // 朗读结束事件
    currentUtterance.onend = () => {
        console.log(`语音结束：第 ${currentSegmentIndex + 1} 段`);
        if (currentSpeaking && currentSegmentIndex < speakingSegments.length - 1) {
            // 移动到下一段
            currentSegmentIndex++;
            console.log(`准备朗读下一段：${currentSegmentIndex + 1}`);
            
            // 短暂延迟后继续，减少停顿让朗读更连贯
            setTimeout(() => {
                if (currentSpeaking) {
                    speakNextSegment();
                }
            }, 100);
        } else {
            // 全部朗读完成
            console.log('所有段落朗读完成');
            stopSpeaking();
        }
    };
    
    // 错误处理
    currentUtterance.onerror = (event) => {
        console.error('语音合成错误:', event);
        // 只有在不是用户主动停止的情况下才显示错误信息
        if (currentSpeaking) {
            stopSpeaking();
            // 检查错误类型，避免显示不必要的错误信息
            if (event.error !== 'interrupted' && event.error !== 'canceled') {
                showMessage('朗读出错，请重试', 'error');
            }
        }
    };
    
    // 边界事件（可选，用于更精确的同步）
    currentUtterance.onboundary = (event) => {
        if (event.name === 'sentence' || event.name === 'word') {
            // 在句子或单词边界时确保高亮仍然正确
            if (currentSpeaking) {
                highlightSpeechSegment(currentSegmentIndex);
            }
        }
    };
    
    // 开始语音合成
    try {
        synthesis.speak(currentUtterance);
        console.log('语音合成已启动');
    } catch (error) {
        console.error('启动语音合成失败:', error);
        stopSpeaking();
        showMessage('朗读启动失败', 'error');
    }
}

function segmentTextForSpeech(text) {
    // 清理文本
    const cleanText = text.replace(/^\s*翻译结果：?\s*/, '').trim();
    
    const segments = [];
    
    // 根据语言类型选择不同的分段策略
    const targetLang = targetSelect.value;
    
    if (targetLang === 'en' || targetLang.startsWith('en-')) {
        // 英文分段
        return segmentWesternLanguage(cleanText);
    } else if (['fr', 'de', 'es', 'pt', 'it', 'nl', 'ru'].includes(targetLang)) {
        // 欧洲语言分段
        return segmentWesternLanguage(cleanText);
    } else if (targetLang === 'ja' || targetLang === 'ko') {
        // 日韩语分段
        return segmentAsianLanguage(cleanText);
    } else if (targetLang === 'ar') {
        // 阿拉伯语分段
        return segmentArabicLanguage(cleanText);
    } else {
        // 中文及其他语言分段
        return segmentChineseLanguage(cleanText);
    }
}

// 西方语言（英文、法文、德文、西班牙文、葡萄牙文、意大利文、荷兰文、俄文）分段
function segmentWesternLanguage(text) {
    const segments = [];
    // 按句子分割，支持多种欧洲语言的标点符号
    const sentences = text.split(/([.!?;]\s+)/);
    let currentText = '';
    
    for (let i = 0; i < sentences.length; i++) {
        const part = sentences[i];
        if (!part.trim()) continue;
        
        currentText += part;
        
        // 在句子结束时分段，或文本过长时分段
        if (/[.!?;]\s+/.test(part) || currentText.length > 100) {
            if (currentText.trim()) {
                segments.push({
                    text: currentText.trim(),
                    startIndex: text.indexOf(currentText.trim()),
                    length: currentText.trim().length
                });
                currentText = '';
            }
        }
    }
    
    // 处理剩余文本
    if (currentText.trim()) {
        segments.push({
            text: currentText.trim(),
            startIndex: text.indexOf(currentText.trim()),
            length: currentText.trim().length
        });
    }
    
    return reindexSegments(segments, text);
}

// 中文分段
function segmentChineseLanguage(text) {
    const segments = [];
    const sentences = text.split(/([。！？]\s*)/);
    let currentText = '';
    
    for (let i = 0; i < sentences.length; i++) {
        const part = sentences[i];
        if (!part.trim()) continue;
        
        currentText += part;
        
        // 只在主要句子结束时分段
        if (/^[。！？]\s*$/.test(part)) {
            if (currentText.trim()) {
                segments.push({
                    text: currentText.trim(),
                    startIndex: text.indexOf(currentText.trim()),
                    length: currentText.trim().length
                });
                currentText = '';
            }
        } else if (currentText.length > 80) {
            // 长文本按分号分割
            const longParts = currentText.split(/([；]\s*)/);
            let longText = '';
            
            for (let longPart of longParts) {
                longText += longPart;
                
                if (/[；]\s*/.test(longPart)) {
                    if (longText.trim()) {
                        segments.push({
                            text: longText.trim(),
                            startIndex: text.indexOf(longText.trim()),
                            length: longText.trim().length
                        });
                        longText = '';
                    }
                }
            }
            
            if (longText.trim()) {
                segments.push({
                    text: longText.trim(),
                    startIndex: text.indexOf(longText.trim()),
                    length: longText.trim().length
                });
            }
            currentText = '';
        }
    }
    
    // 处理剩余文本
    if (currentText.trim()) {
        segments.push({
            text: currentText.trim(),
            startIndex: text.indexOf(currentText.trim()),
            length: currentText.trim().length
        });
    }
    
    return reindexSegments(segments, text);
}

// 日韩语分段
function segmentAsianLanguage(text) {
    const segments = [];
    const targetLang = targetSelect.value;
    
    if (targetLang === 'ko') {
        // 韩文专用分段逻辑
        return segmentKoreanLanguage(text);
    } else {
        // 日语分段逻辑
        const sentences = text.split(/([。！？．]\s*)/);
        let currentText = '';
        
        for (let i = 0; i < sentences.length; i++) {
            const part = sentences[i];
            if (!part.trim()) continue;
            
            currentText += part;
            
            if (/^[。！？．]\s*$/.test(part) || currentText.length > 60) {
                if (currentText.trim()) {
                    segments.push({
                        text: currentText.trim(),
                        startIndex: text.indexOf(currentText.trim()),
                        length: currentText.trim().length
                    });
                    currentText = '';
                }
            }
        }
        
        if (currentText.trim()) {
            segments.push({
                text: currentText.trim(),
                startIndex: text.indexOf(currentText.trim()),
                length: currentText.trim().length
            });
        }
        
        return reindexSegments(segments, text);
    }
}

// 韩文专用分段
function segmentKoreanLanguage(text) {
    const segments = [];
    
    // 韩文常见的语法结尾和分段点
    const koreanPatterns = [
        '다\\.',      // 句子结尾
        '다"',        // 引用结尾  
        '다,',        // 逗号前的结尾
        '다\\s',      // 空格前的结尾
        '요\\.',      // 敬语结尾
        '요"',        // 敬语引用结尾
        '요,',        // 敬语逗号结尾
        '습니다',     // 正式敬语
        '입니다',     // 正式敬语系词
        '있다',       // 存在动词
        '없다',       // 否定存在
        '한다',       // 做
        '된다',       // 成为
        '라고',       // 引用助词
        '지만',       // 转折
        '고\\s',      // 连接语尾
        '며\\s',      // 连接语尾
    ];
    
    // 多策略分段
    let sentences = [];
    
    // 1. 首先尝试按句号、问号、感叹号分段
    sentences = text.split(/([.。！？]\s*)/);
    
    // 2. 如果分段效果不好，按韩文语法模式分段
    if (sentences.length <= 2) {
        const pattern = new RegExp(`(${koreanPatterns.join('|')})`, 'g');
        sentences = text.split(pattern);
    }
    
    // 3. 按逗号分段
    if (sentences.length <= 2) {
        sentences = text.split(/([,，]\s*)/);
    }
    
    // 4. 强制按字符长度分段
    if (sentences.length <= 2 || sentences.every(s => s.length > 100)) {
        sentences = [];
        const maxLength = 40; // 韩文每段最大字符数
        
        for (let i = 0; i < text.length; i += maxLength) {
            const segment = text.substring(i, i + maxLength);
            if (segment.trim()) {
                sentences.push(segment);
            }
        }
    }
    
    // 构建最终分段
    let currentText = '';
    
    for (let i = 0; i < sentences.length; i++) {
        const part = sentences[i];
        if (!part || !part.trim()) continue;
        
        currentText += part;
        
        // 判断是否结束当前段
        const shouldEnd = 
            /^[.。！？,，]\s*$/.test(part) ||          // 标点符号
            /(?:다|요|습니다|입니다)[\s".,]/.test(part) ||  // 韩文常见结尾
            currentText.length > 60;                    // 长度限制
        
        if (shouldEnd && currentText.trim()) {
            segments.push({
                text: currentText.trim(),
                startIndex: text.indexOf(currentText.trim()),
                length: currentText.trim().length
            });
            currentText = '';
        }
    }
    
    // 处理剩余文本
    if (currentText.trim()) {
        segments.push({
            text: currentText.trim(),
            startIndex: text.indexOf(currentText.trim()),
            length: currentText.trim().length
        });
    }
    
    // 确保至少有一个段落
    if (segments.length === 0) {
        // 如果所有方法都失败，强制按长度分段
        const chunkSize = 35;
        for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.substring(i, i + chunkSize).trim();
            if (chunk) {
                segments.push({
                    text: chunk,
                    startIndex: i,
                    length: chunk.length
                });
            }
        }
    }
    
    console.log('韩文分段结果：', segments);
    return reindexSegments(segments, text);
}

// 阿拉伯语分段
function segmentArabicLanguage(text) {
    const segments = [];
    // 阿拉伯语按句号、问号、感叹号分段
    const sentences = text.split(/([.!?؟]\s+)/);
    let currentText = '';
    
    for (let i = 0; i < sentences.length; i++) {
        const part = sentences[i];
        if (!part.trim()) continue;
        
        currentText += part;
        
        if (/[.!?؟]\s+/.test(part) || currentText.length > 80) {
            if (currentText.trim()) {
                segments.push({
                    text: currentText.trim(),
                    startIndex: text.indexOf(currentText.trim()),
                    length: currentText.trim().length
                });
                currentText = '';
            }
        }
    }
    
    if (currentText.trim()) {
        segments.push({
            text: currentText.trim(),
            startIndex: text.indexOf(currentText.trim()),
            length: currentText.trim().length
        });
    }
    
    return reindexSegments(segments, text);
}

// 重新计算段落索引
function reindexSegments(segments, text) {
    const finalSegments = [];
    let searchIndex = 0;
    
    for (let segment of segments) {
        if (!segment.text) continue;
        
        const actualIndex = text.indexOf(segment.text, searchIndex);
        if (actualIndex !== -1) {
            finalSegments.push({
                text: segment.text,
                startIndex: actualIndex,
                length: segment.text.length
            });
            searchIndex = actualIndex + segment.text.length;
        }
    }
    
    console.log('分段结果：', finalSegments);
    return finalSegments;
}

function highlightSpeechSegment(segmentIndex) {
    const translationText = resultDiv.querySelector('.translation-text');
    if (!translationText) {
        console.log('未找到翻译文本元素');
        return;
    }
    
    // 获取原始文本（去除之前的HTML标签）
    let originalText = translationText.textContent || translationText.innerText;
    originalText = originalText.replace(/^\s*翻译结果：?\s*/, '').trim();
    
    console.log('当前分段索引：', segmentIndex);
    console.log('总分段数：', speakingSegments.length);
    console.log('当前段落：', speakingSegments[segmentIndex]);
    
    // 重新构建HTML，确保文本匹配准确
    let highlightedHTML = '';
    let lastProcessedIndex = 0;
    
    // 按顺序处理每个段落
    speakingSegments.forEach((segment, idx) => {
        // 在剩余文本中查找当前段落
        const segmentStart = originalText.indexOf(segment.text, lastProcessedIndex);
        
        if (segmentStart >= lastProcessedIndex) {
            // 添加段落前的普通文本
            if (segmentStart > lastProcessedIndex) {
                const beforeText = originalText.substring(lastProcessedIndex, segmentStart);
                highlightedHTML += escapeHtml(beforeText);
            }
            
            // 确定当前段落的样式类
            let className = 'speech-highlight ';
            if (idx === segmentIndex) {
                className += 'current';
                console.log('高亮当前段落：', segment.text);
            } else if (idx < segmentIndex) {
                className += 'completed';
            } else {
                className += 'pending';
            }
            
            // 添加带样式的段落
            highlightedHTML += `<span class="${className}" data-segment="${idx}">${escapeHtml(segment.text)}</span>`;
            
            // 更新处理位置
            lastProcessedIndex = segmentStart + segment.text.length;
        } else {
            console.warn('无法找到段落：', segment.text);
        }
    });
    
    // 添加剩余的文本
    if (lastProcessedIndex < originalText.length) {
        const remainingText = originalText.substring(lastProcessedIndex);
        highlightedHTML += escapeHtml(remainingText);
    }
    
    // 更新显示
    translationText.innerHTML = highlightedHTML;
    
    // 滚动到当前高亮位置
    const currentHighlight = translationText.querySelector('.speech-highlight.current');
    if (currentHighlight) {
        currentHighlight.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
        });
    }
}

function clearSpeechHighlight() {
    const translationText = resultDiv.querySelector('.translation-text');
    if (translationText) {
        // 移除所有高亮标签，恢复原始文本
        const originalText = translationText.textContent;
        translationText.innerHTML = escapeHtml(originalText);
    }
}

// 增强的HTML转义函数，防止XSS攻击
function escapeHtml(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 输入内容安全验证
function validateInput(text) {
    // 移除潜在的恶意脚本标签
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

function getVoiceLang(langCode) {
    const voiceLangMap = {
        'zh': 'zh-CN',
        'zh-classical': 'zh-CN',
        'en': 'en-US',
        'ja': 'ja-JP',
        'ko': 'ko-KR',
        'fr': 'fr-FR',
        'de': 'de-DE',
        'es': 'es-ES',
        'pt': 'pt-PT',
        'it': 'it-IT',
        'nl': 'nl-NL',
        'ru': 'ru-RU',
        'ar': 'ar-SA'
    };
    return voiceLangMap[langCode] || 'zh-CN';
}

function selectBestVoiceForLanguage(langCode) {
    if (availableVoices.length === 0) {
        return null;
    }
    
    const targetLang = getVoiceLang(langCode);
    
    // 筛选符合语言的语音
    const matchingVoices = availableVoices.filter(voice => 
        voice.lang.startsWith(targetLang.split('-')[0]) || 
        voice.lang === targetLang
    );
    
    console.log(`为 ${targetLang} 找到 ${matchingVoices.length} 个匹配语音`);
    
    if (matchingVoices.length === 0) {
        // 如果没有匹配的语音，使用默认语音
        const defaultVoice = availableVoices.find(voice => voice.default) || availableVoices[0];
        console.log('使用默认语音:', defaultVoice?.name);
        return defaultVoice || null;
    }
    
    // 优先策略：选择高质量、稳定的语音引擎
    // 1. 优先选择Microsoft语音（Windows系统推荐）
    const microsoftVoices = matchingVoices.filter(voice => 
        voice.name.toLowerCase().includes('microsoft')
    );
    
    if (microsoftVoices.length > 0) {
        console.log('选择Microsoft语音:', microsoftVoices[0].name);
        return microsoftVoices[0];
    }
    
    // 2. 优先选择Google语音（质量较好）
    const googleVoices = matchingVoices.filter(voice => 
        voice.name.toLowerCase().includes('google')
    );
    
    if (googleVoices.length > 0) {
        console.log('选择Google语音:', googleVoices[0].name);
        return googleVoices[0];
    }
    
    // 3. 选择本地语音（较为稳定）
    const localVoices = matchingVoices.filter(voice => voice.localService);
    
    if (localVoices.length > 0) {
        console.log('选择本地语音:', localVoices[0].name);
        return localVoices[0];
    }
    
    // 4. 选择默认语音
    const defaultVoice = matchingVoices.find(voice => voice.default);
    
    if (defaultVoice) {
        console.log('选择默认语音:', defaultVoice.name);
        return defaultVoice;
    }
    
    // 5. 最后选择第一个匹配的语音
    console.log('选择第一个匹配语音:', matchingVoices[0].name);
    return matchingVoices[0];
}

async function handleTranslate() {
    const rawText = sourceTextArea.value.trim();
    if (!rawText) {
        showMessage('请输入要翻译的文本', 'warning');
        return;
    }
    
    // 安全验证用户输入
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
    
    // 显示加载状态
    translateBtn.disabled = true;
    
    try {
        let translationResult;
        let isFromCache = false;
        
        // 检查是否有缓存
        const cacheKey = getCacheKey(sourceText, sourceLang, targetLang);
        if (translationCache.has(cacheKey)) {
            translateBtn.innerHTML = '<i class="fas fa-bolt"></i> 快速翻译...';
            isFromCache = true;
        } else {
            translateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI翻译中...';
        }
        
        // 首先尝试使用DeepSeek API
        try {
            translationResult = await translateWithDeepSeek(sourceText, sourceLang, targetLang);

            // 显示翻译结果 (使用 escapeHtml 防止 XSS 攻击)
            resultDiv.innerHTML = `<div class="translation-text">${escapeHtml(translationResult)}</div>`;

            // 如果是从缓存获取的，显示提示
            if (isFromCache) {
                showMessage('使用缓存结果，响应更快！', 'success');
            }

        } catch (apiError) {
            console.log('API翻译失败，使用内置翻译:', apiError.message);

            // API失败时使用内置翻译
            translationResult = translateWithBuiltIn(sourceText, sourceLang, targetLang);

            resultDiv.innerHTML = `<div class="translation-text">${escapeHtml(translationResult)}</div>`;
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

// 统一的引号移除函数
function removeQuotes(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }
    
    let result = text.trim();
    
    // 去掉开头和结尾的各种引号
    const quotePatterns = [
        ['"', '"'],         // 英文双引号
        ["'", "'"],         // 英文单引号
        ["\u201c", "\u201d"], // 中文双引号 " "
        ["\u2018", "\u2019"], // 中文单引号 ' '
        ["\u300c", "\u300d"], // 中文直角引号 「 」
        ["\u300e", "\u300f"], // 中文双直角引号 『 』
        ["\u00ab", "\u00bb"], // 法文/德文/西班牙文/意大利文引号 « »
        ["\u201e", "\u201c"], // 德文/俄文引号 „ "
        ["\u201a", "\u2019"], // 德文单引号 ‚ '
        ["\u201b", "\u2019"], // 反向单引号 ‛ '
        ["\u201c", "\u201d"], // 通用左右双引号
        ["\u2018", "\u2019"], // 通用左右单引号
        ["\u300a", "\u300b"], // 中文书名号 《 》
        ["\u3008", "\u3009"], // 中文单书名号 〈 〉
        ["\u2039", "\u203a"], // 单角引号 ‹ ›
        ["\u301d", "\u301e"], // 另一种中文引号 〝 〞
        ["\u275d", "\u275e"], // 重双引号 ❝ ❞
        ["\u275b", "\u275c"], // 重单引号 ❛ ❜
        ["\u276e", "\u276f"]  // 重角引号 ❮ ❯
    ];
    
    // 检查并移除匹配的引号对
    for (const [startQuote, endQuote] of quotePatterns) {
        if (result.startsWith(startQuote) && result.endsWith(endQuote)) {
            result = result.slice(startQuote.length, -endQuote.length);
            break; // 只移除一层引号
        }
    }
    
    return result;
}

async function translateWithDeepSeek(text, sourceLang, targetLang) {
    if (!API_CONFIG.apiKey) {
        throw new Error('API密钥未配置');
    }
    
    // 检查缓存
    const cacheKey = getCacheKey(text, sourceLang, targetLang);
    if (translationCache.has(cacheKey)) {
        console.log('使用缓存结果');
        return translationCache.get(cacheKey);
    }
    
    const prompt = createTranslationPrompt(text, sourceLang, targetLang);
    
    // 创建一个带超时的fetch请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
    
    try {
        const response = await fetch(API_CONFIG.baseURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是佛教文献翻译专家，提供准确、简洁的翻译。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,     // 降低温度以减少生成时间和提高一致性
                max_tokens: 800,      // 减少最大token数以提高响应速度
                top_p: 0.9,          // 添加top_p参数优化生成质量
                stream: false        // 确保非流式响应
            }),
            signal: controller.signal  // 添加超时控制
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API请求失败: ${response.status} ${errorData.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API返回数据格式错误');
        }
        
        let result = data.choices[0].message.content.trim();
        result = removeQuotes(result);
        
        // 缓存结果
        cleanCache();
        translationCache.set(cacheKey, result);
        console.log('翻译结果已缓存');
        
        return result;
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('翻译请求超时，请稍后重试');
        }
        throw error;
    }
}

function createTranslationPrompt(text, sourceLang, targetLang) {
    // 简化的语言映射
    const langMap = {
        'auto': '自动检测', 'zh': '中文', 'zh-classical': '文言文', 'en': '英文',
        'sa': '梵文', 'sa-hk': '梵文转写', 'bo': '藏文', 'pi': '巴利文',
        'fr': '法文', 'de': '德文', 'es': '西班牙文', 'pt': '葡萄牙文',
        'it': '意大利文', 'nl': '荷兰文', 'ja': '日文', 'ko': '韩文',
        'ru': '俄文', 'ar': '阿拉伯文'
    };
    
    const sourceDesc = langMap[sourceLang] || '未知语言';
    const targetDesc = langMap[targetLang] || '未知语言';
    
    // 根据目标语言简化提示词
    let prompt = `将${sourceDesc}翻译为${targetDesc}：

${text}

`;
    
    // 简化的要求说明
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

function translateWithBuiltIn(text, sourceLang, targetLang) {
    let result = '';
    
    // 检查是否为佛教术语
    for (const [term, translation] of Object.entries(buddhistTerms)) {
        if (text.includes(term)) {
            if (targetLang === 'en') {
                result = translation.split(' / ')[1] || translation;
                return removeQuotes(result);
            } else if (targetLang === 'sa') {
                const sanskritPart = translation.split(' / ')[2];
                result = sanskritPart || translation;
                return removeQuotes(result);
            }
        }
    }
    
    // 基础翻译逻辑
    if (sourceLang === 'zh-classical' && targetLang === 'zh') {
        result = `${text}（现代中文解释：这是一段古典佛教文献，建议使用AI翻译获得更准确的现代中文解释）`;
    } else if (targetLang === 'zh') {
        result = `${text}（建议使用AI翻译获得更准确的翻译结果）`;
    } else if (targetLang === 'en') {
        result = `${text} (Please use AI translation for more accurate results)`;
    } else {
        result = `翻译暂不支持此语言对：${languageMap[sourceLang]} → ${languageMap[targetLang]}`;
    }
    
    return removeQuotes(result);
}

// API设置相关函数
function showApiSettings() {
    const modal = document.getElementById('api-modal-overlay');
    const apiKeyInput = document.getElementById('api-key-input');
    const statusDiv = document.getElementById('api-status');
    
    // 显示当前API密钥
    apiKeyInput.value = API_CONFIG.apiKey;
    
    // 清除状态显示
    statusDiv.className = 'api-status';
    statusDiv.textContent = '';
    
    // 显示模态框
    modal.classList.add('show');
}

function hideApiSettings() {
    const modal = document.getElementById('api-modal-overlay');
    modal.classList.remove('show');
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
    
    // 保存到本地存储
    localStorage.setItem('deepseek_api_key', apiKey);
    API_CONFIG.apiKey = apiKey;
    
    statusDiv.className = 'api-status success';
    statusDiv.textContent = 'API密钥保存成功！';
    
    // 2秒后关闭模态框
    setTimeout(() => {
        hideApiSettings();
        updateApiKeyStatus();
    }, 2000);
}

function checkApiKeyStatus() {
    const apiConfigBtn = document.getElementById('api-settings-btn');
    const apiStatusText = document.getElementById('api-status-text');
    const apiStatusIndicator = document.getElementById('api-status-indicator');
    
    if (API_CONFIG.apiKey) {
        // API已配置状态
        apiConfigBtn.classList.add('configured');
        apiConfigBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>API已配置</span>';
        apiConfigBtn.title = 'API已配置，点击修改';
        
        apiStatusText.textContent = 'API已配置';
        apiStatusIndicator.classList.add('connected');
    } else {
        // API未配置状态
        apiConfigBtn.classList.remove('configured');
        apiConfigBtn.innerHTML = '<i class="fas fa-key"></i><span>配置API</span>';
        apiConfigBtn.title = '点击配置DeepSeek API密钥';
        
        apiStatusText.textContent = 'API未配置';
        apiStatusIndicator.classList.remove('connected');
        
        // 如果没有API密钥，延迟显示提示
        setTimeout(() => {
            showMessage('请先配置DeepSeek API密钥才能使用翻译功能', 'warning');
        }, 1500);
    }
}

function updateApiKeyStatus() {
    checkApiKeyStatus();
    showMessage('API配置已更新', 'success');
}

function showMessage(message, type = 'info') {
    // 创建消息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    // 添加到页面
    document.body.appendChild(messageDiv);
    
    // 显示动画
    setTimeout(() => {
        messageDiv.classList.add('show');
    }, 10);
    
    // 自动隐藏
    setTimeout(() => {
        messageDiv.classList.remove('show');
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 300);
    }, 3000);
}
