import test from 'node:test';
import assert from 'node:assert/strict';

const {
    MITRA_CONFIG,
    canUseMitra,
    detectWitnessField,
    focusForField,
    isMitraReachable,
    resolveSearchEndpoint,
    resolveTranslateEndpoint,
    searchCanonical,
    searchLanguageFor,
    targetLabelFor,
    translateWithMitra,
    witnessFieldFor
} = await import('../src/mitra.js');
const { API_CONFIG } = await import('../src/config.js');

test.beforeEach(() => {
    API_CONFIG.proxyURL = '';
});

function recordingFetch(response) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return {
            ok: true,
            status: 200,
            async json() {
                return response;
            }
        };
    };
    return { calls, fetchImpl };
}

test('detectWitnessField recognises the four canon scripts and refuses Latin', () => {
    assert.equal(detectWitnessField('如是我聞'), 'input_chinese');
    assert.equal(detectWitnessField('འདུལ་བ་གཞི།'), 'input_tibetan');
    assert.equal(detectWitnessField('धर्म'), 'input_sanskrit');
    // 拉丁字母下 IAST 梵文、巴利文、英文同形，猜错代价大于不猜
    assert.equal(detectWitnessField('evaṃ mayā śrutam'), null);
    assert.equal(detectWitnessField(''), null);
    assert.equal(detectWitnessField(null), null);
});

test('witnessFieldFor maps explicit languages and falls back to detection on auto', () => {
    assert.equal(witnessFieldFor('zh-classical', ''), 'input_chinese');
    assert.equal(witnessFieldFor('sa-hk', ''), 'input_sanskrit');
    assert.equal(witnessFieldFor('bo', ''), 'input_tibetan');
    assert.equal(witnessFieldFor('pi', ''), 'input_pali');
    assert.equal(witnessFieldFor('auto', '如是我聞'), 'input_chinese');
    // 现代语言不是佛典写本语言
    assert.equal(witnessFieldFor('en', 'thus have I heard'), null);
    assert.equal(witnessFieldFor('fr', ''), null);
});

test('targetLabelFor returns free-form labels, not ISO codes', () => {
    assert.equal(targetLabelFor('zh'), 'modern chinese');
    assert.equal(targetLabelFor('en'), 'english');
    assert.equal(targetLabelFor('ko'), 'korean');
    // MITRA 不产出文言文或古典语言
    assert.equal(targetLabelFor('zh-classical'), null);
    assert.equal(targetLabelFor('sa'), null);
    assert.equal(targetLabelFor('bo'), null);
});

test('canUseMitra requires both a witness language and a supported target', () => {
    assert.equal(canUseMitra('zh-classical', 'en', '如是我聞'), true);
    assert.equal(canUseMitra('auto', 'zh', '如是我聞'), true);
    assert.equal(canUseMitra('zh-classical', 'zh-classical', '如是我聞'), false);
    assert.equal(canUseMitra('en', 'zh', 'thus have I heard'), false);
});

test('translateWithMitra sends every witness field and passes style through verbatim', async () => {
    const { calls, fetchImpl } = recordingFetch({ translation: '  如是我聞  ' });

    const result = await translateWithMitra({
        witnesses: { input_chinese: ' 如是我聞 ', input_sanskrit: 'evaṃ mayā śrutam' },
        targetLabel: 'english',
        focus: 'chinese',
        context: 'glossary here',
        styleInstruction: 'hyper-literal, no smoothing'
    }, fetchImpl);

    assert.equal(result, '如是我聞');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, MITRA_CONFIG.translateURL);
    assert.equal(calls[0].init.method, 'POST');

    const body = calls[0].body;
    // 四个 input_* 字段都必须存在，未给的留空字符串
    assert.equal(body.input_chinese, '如是我聞');
    assert.equal(body.input_sanskrit, 'evaṃ mayā śrutam');
    assert.equal(body.input_tibetan, '');
    assert.equal(body.input_pali, '');
    assert.equal(body.target_language, 'english');
    assert.equal(body.focus, 'chinese');
    assert.equal(body.context, 'glossary here');
    assert.equal(body.style_instruction, 'hyper-literal, no smoothing');
});

test('translateWithMitra rejects empty input and unsupported targets', async () => {
    const { fetchImpl } = recordingFetch({ translation: 'x' });

    await assert.rejects(
        translateWithMitra({ witnesses: { input_chinese: '   ' }, targetLabel: 'english' }, fetchImpl),
        /至少需要一路写本原文/
    );
    await assert.rejects(
        translateWithMitra({ witnesses: { input_chinese: '如是我聞' }, targetLabel: null }, fetchImpl),
        /不支持该目标语种/
    );
});

test('translateWithMitra surfaces upstream failures and blank translations', async () => {
    const failing = async () => ({ ok: false, status: 503, async json() { return {}; } });
    await assert.rejects(
        translateWithMitra({ witnesses: { input_chinese: '如是我聞' }, targetLabel: 'english' }, failing),
        /MITRA 请求失败: 503/
    );

    const blank = async () => ({ ok: true, status: 200, async json() { return { translation: '   ' }; } });
    await assert.rejects(
        translateWithMitra({ witnesses: { input_chinese: '如是我聞' }, targetLabel: 'english' }, blank),
        /MITRA 返回数据格式错误/
    );
});

test('focusForField maps witness fields onto the focus enum', () => {
    assert.equal(focusForField('input_chinese'), 'chinese');
    assert.equal(focusForField('input_tibetan'), 'tibetan');
    assert.equal(focusForField('input_sanskrit'), 'sanskrit');
    assert.equal(focusForField('input_pali'), 'pali');
    assert.equal(focusForField(null), 'equal');
});

test('searchLanguageFor derives the corpus filter from language or script', () => {
    assert.equal(searchLanguageFor('zh-classical', ''), 'zh');
    assert.equal(searchLanguageFor('pi', ''), 'pa');
    assert.equal(searchLanguageFor('auto', 'འདུལ་བ།'), 'bo');
    assert.equal(searchLanguageFor('auto', 'धर्म'), 'sa');
    assert.equal(searchLanguageFor('auto', 'hello'), 'all');
});

test('searchCanonical disables the browser-tuned ranker and drops the heavy fields', async () => {
    const { calls, fetchImpl } = recordingFetch({
        results: [
            {
                segmentnr: 'ZH_T08_0251_001:0848c07',
                lang: 'zh',
                source: 'ZH_T08_0251',
                title: '般若波羅蜜多心經',
                text: '  觀自在菩薩\n行深般若波羅蜜多時  ',
                src_link: 'https://dharmamitra.org/nexus/db/zh/ZH_T08_0251/text',
                vector: [0.1, 0.2, 0.3],
                text_new: { junk: 'x' }
            }
        ]
    });

    const hits = await searchCanonical({ text: ' 照見五蘊皆空 ', sourceLang: 'zh-classical' }, fetchImpl);

    assert.equal(calls[0].url, MITRA_CONFIG.searchURL);
    assert.equal(calls[0].body.search_input, '照見五蘊皆空');
    assert.equal(calls[0].body.do_ranking, false);
    assert.equal(calls[0].body.filter_source_language, 'zh');

    assert.equal(hits.length, 1);
    assert.equal(hits[0].text, '觀自在菩薩 行深般若波羅蜜多時');
    // src_link 必须原样使用，不能自己拼 URL
    assert.equal(hits[0].link, 'https://dharmamitra.org/nexus/db/zh/ZH_T08_0251/text');
    assert.equal('vector' in hits[0], false);
    assert.equal('text_new' in hits[0], false);
});

test('searchCanonical honours the result limit and rejects empty queries', async () => {
    const many = Array.from({ length: 30 }, (unused, index) => ({
        segmentnr: `ZH_T08_0251_001:${index}`,
        text: `段落 ${index}`,
        src_link: 'https://dharmamitra.org/x'
    }));
    const { fetchImpl } = recordingFetch({ results: many });

    const hits = await searchCanonical({ text: '空', limit: 5 }, fetchImpl);
    assert.equal(hits.length, 5);

    await assert.rejects(searchCanonical({ text: '   ' }, fetchImpl), /检索内容不能为空/);
});

test('browsers must not be pointed straight at dharmamitra.org', () => {
    // 2026-08-14 实测：两个端点的实际响应都重复发送 Access-Control-Allow-Origin: *，
    // 浏览器一律拒收。上游修好之前，allowDirect 必须保持 false。
    assert.equal(MITRA_CONFIG.allowDirect, false);
    assert.equal(isMitraReachable(), false, 'no proxy configured means MITRA is not usable');

    API_CONFIG.proxyURL = 'https://proxy.example.workers.dev';
    assert.equal(isMitraReachable(), true);
});

test('endpoints resolve to the Worker proxy whenever one is configured', () => {
    assert.equal(resolveTranslateEndpoint(), MITRA_CONFIG.translateURL);
    assert.equal(resolveSearchEndpoint(), MITRA_CONFIG.searchURL);

    API_CONFIG.proxyURL = 'https://proxy.example.workers.dev/';
    assert.equal(resolveTranslateEndpoint(), 'https://proxy.example.workers.dev/mitra/translate');
    assert.equal(resolveSearchEndpoint(), 'https://proxy.example.workers.dev/mitra/search');
});

test('translateWithMitra and searchCanonical go through the proxy when set', async () => {
    API_CONFIG.proxyURL = 'https://proxy.example.workers.dev';

    const translateCalls = recordingFetch({ translation: 'ok' });
    await translateWithMitra(
        { witnesses: { input_chinese: '如是我聞' }, targetLabel: 'english' },
        translateCalls.fetchImpl
    );
    assert.equal(translateCalls.calls[0].url, 'https://proxy.example.workers.dev/mitra/translate');

    const searchCalls = recordingFetch({ results: [] });
    await searchCanonical({ text: '如是我聞' }, searchCalls.fetchImpl);
    assert.equal(searchCalls.calls[0].url, 'https://proxy.example.workers.dev/mitra/search');
});

test('MITRA translate timeout leaves room for the documented 60s worst case', () => {
    // 官方文档：长输入可能要 60 秒，上游 Cloudflare 100 秒截断
    assert.ok(MITRA_CONFIG.translateTimeoutMs >= 90000, 'translate timeout must not be tightened below 90s');
    assert.ok(MITRA_CONFIG.translateTimeoutMs <= 100000, 'translate timeout must stay under the upstream 100s cap');
});
