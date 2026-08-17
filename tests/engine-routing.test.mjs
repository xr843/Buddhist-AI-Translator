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

test('translateText routes a canon passage through MITRA with style, and injects the glossary when explicitly asked', async () => {
    const calls = stubFetch(() => mitraResponse('Thus have I heard.'));

    // useLexicon 现在默认关（两轮盲评测不出正收益，见 translateText 的注释）。
    // 这条测试钉的是**显式开启后注入链路仍然完好**，因为 eval/ 下的 A/B 依赖它，
    // 将来若有证据要改回默认开，也得靠这条保证代码没烂掉。
    const outcome = await translateText({
        witnesses: { 'zh-classical': '如是我聞，涅槃者' },
        sourceLang: 'zh-classical',
        targetLang: 'en',
        style: { literalness: 'literal' },
        useLexicon: true
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

/*
 * 这条是把「不注入术语库」钉成契约的那一条。
 *
 * 结论来自两轮盲评（共 55 段，6 与 12 位互不通气的判官，对照题守着）：
 * 术语库在翻译链路上测不出正收益，而它带来的括注错误可以定位到具体条目
 * （薩婆若 / 所知障 / 有漏 的首选梵文形式都是错的）。详见 translateText 的注释
 * 与 eval/RESULTS.md。
 *
 * 没有这条测试，任何人（包括我）把默认翻回 true 都不会有东西变红，
 * 那两轮实验就白做了。所以它同时钉三件事：不发词表请求、context 为空、
 * lexiconTerms 为 0 —— 只钉最后一个不够，因为 context 里塞了东西而
 * 计数算错的情况也会通过。
 */
test('translateText does not fetch or inject the glossary by default', async () => {
    resetLexicon();
    API_CONFIG.proxyURL = PROXY;
    API_CONFIG.apiKey = '';
    const calls = stubFetch(url => {
        if (url.includes('lexicon.json')) {
            throw new Error('默认路径不该去取术语库');
        }
        return mitraResponse('Thus have I heard.');
    });

    const outcome = await translateText({
        witnesses: { 'zh-classical': '如是我聞，涅槃者' },   // 涅槃 在 fixture 里，开着必然命中
        sourceLang: 'zh-classical',
        targetLang: 'en'
    });

    assert.equal(outcome.text, 'Thus have I heard.');
    assert.equal(
        calls.filter(call => String(call.url).includes('lexicon.json')).length,
        0,
        '默认不该发出术语库请求——发了就等于白付流量却没有收益'
    );
    assert.equal(calls.at(-1).body.context, '', 'context 必须是空的');
    assert.equal(outcome.lexiconTerms, 0);
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
    // 用户填了密钥就走直连（见下一条测试），所以这里给的是直连的响应形状
    stubFetch(url => (
        /mitra\/translate/.test(url) ? mitraResponse('mitra 译文') : deepseekResponse('deepseek 译文')
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

/*
 * 用户自己填的密钥优先于公共中转。
 *
 * 这条坏过一次：站点把 proxyURL 写死进 config.js 之后（#79），hasProxyURL()
 * 恒为 true，DeepSeek 那条路于是无条件走中转——而那个中转只为 MITRA 而设、
 * 没有配 DEEPSEEK_API_KEY。用户明明填了自己的密钥，却收到
 * 「服务端 API 密钥未配置」，密钥从未被使用。
 *
 * 本项目开源自部署，BYOK 是 DeepSeek 那条路唯一现实的用法。
 */
test('a user key routes straight to DeepSeek, bypassing the shared relay', async () => {
    API_CONFIG.proxyURL = 'https://relay.example';
    API_CONFIG.apiKey = 'sk-user-own';
    const calls = stubFetch(() => deepseekResponse('用户自己的密钥译出来的'));

    const outcome = await translateText({
        witnesses: { en: 'all things are impermanent' },
        sourceLang: 'en',
        targetLang: 'zh'
    });

    assert.equal(outcome.text, '用户自己的密钥译出来的');
    const target = calls[calls.length - 1];
    assert.match(target.url, /api\.deepseek\.com/, 'must go direct, not through the relay');
    assert.doesNotMatch(target.url, /relay\.example/);
    // 直连时前端自己拼 prompt；走中转的话 body 里只有 text/sourceLang/targetLang
    assert.ok(Array.isArray(target.body?.messages), 'direct mode sends the chat payload');
});

test('without a user key the relay still handles DeepSeek', async () => {
    API_CONFIG.proxyURL = 'https://relay.example';
    API_CONFIG.apiKey = '';
    const calls = stubFetch(() => deepseekResponse('中转译出来的', true));

    const outcome = await translateText({
        witnesses: { en: 'all things are impermanent' },
        sourceLang: 'en',
        targetLang: 'zh'
    });

    assert.equal(outcome.text, '中转译出来的');
    assert.match(calls[calls.length - 1].url, /relay\.example/);
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
        style: { register: 'liturgical' },
        useLexicon: true       // 默认关，这条测的是显式开启时 DeepSeek prompt 也拼得对
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

    // 必须显式 useLexicon: true —— 默认关的话根本不会去取词表，
    // 这条测试就会在「什么都没发生」的情况下变成绿色摆设。
    const outcome = await translateText({
        witnesses: { 'zh-classical': '如是我聞' },
        sourceLang: 'zh-classical',
        targetLang: 'en',
        useLexicon: true
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
