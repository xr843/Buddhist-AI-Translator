import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
    getItem() { return ''; },
    setItem() {},
    removeItem() {}
};

const {
    ENGINES,
    hasDeepSeekCredentials,
    joinWitnessesForPrompt,
    mitraBlockedByDeployment,
    selectEngine,
    toMitraWitnesses,
    translateText
} = await import('../src/translator.js');
const { API_CONFIG, translationCache } = await import('../src/config.js');
const { setLexicon, resetLexicon } = await import('../src/lexicon.js');

// 浏览器直连 dharmamitra 会被重复的 CORS 头挡下，所以 MITRA 一律走 Worker 中转。
// 要测 MITRA 的路径，就得先有一个中转地址。
const PROXY = 'https://proxy.example.workers.dev';

const lexiconFixture = {
    meta: {},
    entries: {
        涅槃: { n: 3486, sa: [['nirvāṇa', 611]] },
        菩薩: { n: 26747, sa: [['bodhisattva', 9081]] }
    }
};

function stubFetch(handler) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        const body = init?.body ? JSON.parse(init.body) : null;
        calls.push({ url, body });
        return handler(url, body);
    };
    return calls;
}

function mitraResponse(translation) {
    return {
        ok: true,
        status: 200,
        async json() { return { translation }; }
    };
}

/** 直连模式返回 choices，中转模式返回 translation —— 按 URL 给对应的形状。 */
function deepseekResponse(content, viaProxy = false) {
    return {
        ok: true,
        status: 200,
        async json() {
            return viaProxy ? { translation: content } : { choices: [{ message: { content } }] };
        }
    };
}

test.beforeEach(() => {
    translationCache.clear();
    resetLexicon();
    setLexicon(lexiconFixture);
    API_CONFIG.apiKey = '';
    API_CONFIG.proxyURL = PROXY;
});

test('selectEngine defaults to MITRA for canon-language sources', () => {
    assert.equal(selectEngine({ sourceLang: 'zh-classical', targetLang: 'en', text: '如是我聞' }), ENGINES.MITRA);
    assert.equal(selectEngine({ sourceLang: 'auto', targetLang: 'zh', text: '如是我聞' }), ENGINES.MITRA);
    assert.equal(selectEngine({ sourceLang: 'bo', targetLang: 'en', text: 'x' }), ENGINES.MITRA);
});

test('without a Worker proxy MITRA is unreachable, so routing falls back to DeepSeek', () => {
    API_CONFIG.proxyURL = '';
    const request = { sourceLang: 'zh-classical', targetLang: 'en', text: '如是我聞' };

    // 语种对本身没问题，问题在这套部署没有中转
    assert.equal(selectEngine(request), ENGINES.DEEPSEEK);
    assert.equal(selectEngine({ ...request, preference: ENGINES.MITRA }), ENGINES.DEEPSEEK);
    assert.equal(mitraBlockedByDeployment(request), true);

    // 语种对本来就不行的，不该报成「部署问题」
    assert.equal(
        mitraBlockedByDeployment({ sourceLang: 'en', targetLang: 'zh', text: 'thus have I heard' }),
        false
    );

    API_CONFIG.proxyURL = PROXY;
    assert.equal(mitraBlockedByDeployment(request), false);
});

test('selectEngine falls back to DeepSeek for pairs MITRA does not handle', () => {
    // 目标是文言文：MITRA 只往现代语言译
    assert.equal(selectEngine({ sourceLang: 'zh', targetLang: 'zh-classical', text: '无常' }), ENGINES.DEEPSEEK);
    // 源语言是现代语言
    assert.equal(selectEngine({ sourceLang: 'en', targetLang: 'zh', text: 'impermanence' }), ENGINES.DEEPSEEK);
    // 目标是古典语言
    assert.equal(selectEngine({ sourceLang: 'zh-classical', targetLang: 'sa', text: '如是我聞' }), ENGINES.DEEPSEEK);
});

test('an explicit MITRA preference still yields to what MITRA cannot do', () => {
    assert.equal(
        selectEngine({ sourceLang: 'zh', targetLang: 'zh-classical', text: '无常', preference: ENGINES.MITRA }),
        ENGINES.DEEPSEEK
    );
    assert.equal(
        selectEngine({ sourceLang: 'zh-classical', targetLang: 'en', text: '如是我聞', preference: ENGINES.DEEPSEEK }),
        ENGINES.DEEPSEEK
    );
});

test('toMitraWitnesses maps app language codes and merges duplicates of one witness', () => {
    assert.deepEqual(
        toMitraWitnesses({ 'zh-classical': '如是我聞', sa: 'evaṃ mayā śrutam', en: 'ignored' }),
        { input_chinese: '如是我聞', input_sanskrit: 'evaṃ mayā śrutam' }
    );

    // 同一路写本给了两段，应该接起来而不是互相覆盖
    assert.deepEqual(
        toMitraWitnesses({ 'zh-classical': '如是我聞', zh: '一時佛在' }),
        { input_chinese: '如是我聞\n一時佛在' }
    );

    // 一路都识别不出时，退回按字形判断整段原文
    assert.deepEqual(toMitraWitnesses({}, '如是我聞'), { input_chinese: '如是我聞' });
    assert.deepEqual(toMitraWitnesses({}, 'thus have I heard'), {});
});

test('joinWitnessesForPrompt labels each witness when there is more than one', () => {
    assert.equal(joinWitnessesForPrompt({ 'zh-classical': '如是我聞' }), '如是我聞');

    const joined = joinWitnessesForPrompt({ 'zh-classical': '如是我聞', sa: 'evaṃ mayā śrutam' });
    assert.match(joined, /【文言文】/);
    assert.match(joined, /【梵文 \(Devanagari\)】/);
    assert.match(joined, /如是我聞/);
});

test('translateText routes a canon passage through MITRA with style and glossary attached', async () => {
    const calls = stubFetch(() => mitraResponse('Thus have I heard.'));

    const outcome = await translateText({
        witnesses: { 'zh-classical': '如是我聞，涅槃者' },
        sourceLang: 'zh-classical',
        targetLang: 'en',
        style: { literalness: 'literal' }
    });

    assert.equal(outcome.engine, ENGINES.MITRA);
    assert.equal(outcome.text, 'Thus have I heard.');
    assert.equal(outcome.fromCache, false);
    assert.equal(calls.length, 1);
    // 配了中转就必须走中转，不能绕过去直连
    assert.equal(calls[0].url, `${PROXY}/mitra/translate`);

    // 译风必须真的送出去
    assert.match(calls[0].body.style_instruction, /Hyper-literal/);
    // 命中的术语必须以实证对照进 context
    assert.match(calls[0].body.context, /涅槃 = nirvāṇa/);
    assert.equal(outcome.lexiconTerms, 1);
});

test('translateText passes focus through in multi-witness mode', async () => {
    const calls = stubFetch(() => mitraResponse('…'));

    await translateText({
        witnesses: { 'zh-classical': '如是我聞', sa: 'evaṃ mayā śrutam' },
        sourceLang: 'zh-classical',
        targetLang: 'en',
        focusLang: 'sa'
    });

    assert.equal(calls[0].body.focus, 'sanskrit');
    assert.equal(calls[0].body.input_chinese, '如是我聞');
    assert.equal(calls[0].body.input_sanskrit, 'evaṃ mayā śrutam');
});

test('translateText reuses the cache for an identical request', async () => {
    const calls = stubFetch(() => mitraResponse('Thus have I heard.'));
    const request = {
        witnesses: { 'zh-classical': '如是我聞' },
        sourceLang: 'zh-classical',
        targetLang: 'en',
        style: { literalness: 'literal' }
    };

    const first = await translateText(request);
    const second = await translateText(request);

    assert.equal(first.fromCache, false);
    assert.equal(second.fromCache, true);
    assert.equal(calls.length, 1);
});

test('changing the style must not serve the previous translation from cache', async () => {
    let served = 0;
    stubFetch(() => mitraResponse(`译文 ${++served}`));
    const base = {
        witnesses: { 'zh-classical': '如是我聞' },
        sourceLang: 'zh-classical',
        targetLang: 'en'
    };

    const literal = await translateText({ ...base, style: { literalness: 'literal' } });
    const fluent = await translateText({ ...base, style: { literalness: 'fluent' } });

    assert.equal(literal.fromCache, false);
    assert.equal(fluent.fromCache, false, 'a different style is a different translation');
    assert.notEqual(literal.text, fluent.text);
    assert.equal(served, 2);
});

test('switching engines must not serve the other engine result from cache', async () => {
    API_CONFIG.apiKey = 'sk-test';
    stubFetch(url => (
        /mitra\/translate/.test(url) ? mitraResponse('mitra 译文') : deepseekResponse('deepseek 译文', true)
    ));
    const base = {
        witnesses: { 'zh-classical': '如是我聞' },
        sourceLang: 'zh-classical',
        targetLang: 'en'
    };

    const viaMitra = await translateText({ ...base, preference: ENGINES.MITRA });
    const viaDeepSeek = await translateText({ ...base, preference: ENGINES.DEEPSEEK });

    assert.equal(viaMitra.text, 'mitra 译文');
    assert.equal(viaDeepSeek.text, 'deepseek 译文');
    assert.equal(viaDeepSeek.fromCache, false);
});

test('translateText sends the glossary and style into the DeepSeek prompt too', async () => {
    // 直连模式才看得到 prompt；中转模式下 prompt 是在 Worker 里拼的
    API_CONFIG.proxyURL = '';
    API_CONFIG.apiKey = 'sk-test';
    const calls = stubFetch(() => deepseekResponse('无常者，谓生灭不住。'));

    const outcome = await translateText({
        witnesses: { zh: '涅槃与菩萨' },
        sourceLang: 'zh',
        targetLang: 'zh-classical',
        style: { register: 'liturgical' }
    });

    assert.equal(outcome.engine, ENGINES.DEEPSEEK);
    const prompt = calls[0].body.messages[1].content;
    assert.match(prompt, /实证对照/);
    assert.match(prompt, /涅槃 = nirvāṇa/);
    assert.match(prompt, /译风要求/);
    assert.match(prompt, /课诵语体/);
});

test('a broken lexicon must not block the translation', async () => {
    resetLexicon();
    const calls = stubFetch(url => {
        if (url.includes('lexicon.json')) return { ok: false, status: 500, async json() { return {}; } };
        return mitraResponse('Thus have I heard.');
    });

    const outcome = await translateText({
        witnesses: { 'zh-classical': '如是我聞' },
        sourceLang: 'zh-classical',
        targetLang: 'en'
    });

    assert.equal(outcome.text, 'Thus have I heard.');
    assert.equal(outcome.lexiconTerms, 0);
    assert.equal(calls.at(-1).body.context, '');
});

test('translateText refuses a request with no source text at all', async () => {
    stubFetch(() => mitraResponse('x'));
    await assert.rejects(
        translateText({ witnesses: { 'zh-classical': '   ' }, sourceLang: 'zh-classical', targetLang: 'en' }),
        /至少需要一段原文/
    );
});

test('hasDeepSeekCredentials reflects key and proxy configuration', () => {
    API_CONFIG.proxyURL = '';
    assert.equal(hasDeepSeekCredentials(), false);
    API_CONFIG.apiKey = 'sk-test';
    assert.equal(hasDeepSeekCredentials(), true);
    API_CONFIG.apiKey = '';
    API_CONFIG.proxyURL = 'https://example.workers.dev';
    assert.equal(hasDeepSeekCredentials(), true);
});
