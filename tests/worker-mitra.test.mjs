import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker/worker.js';

const ALLOWED_ORIGIN = 'https://xr843.github.io';

function request(path, options = {}) {
    const { method = 'POST', origin = ALLOWED_ORIGIN, body, headers = {} } = options;
    const requestHeaders = new Headers(headers);
    if (origin) requestHeaders.set('Origin', origin);
    if (body !== undefined && !requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
    }
    return new Request(`https://translator-worker.example${path}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

function stubUpstream(handler) {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
        return handler(url, calls.length);
    };
    return { calls, restore() { globalThis.fetch = original; } };
}

function upstreamJson(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

test('the Worker exists so browsers do not have to talk to dharmamitra directly', async () => {
    // dharmamitra 在实际响应里重复发送 Access-Control-Allow-Origin，浏览器拒收。
    // 中转出去的响应必须只带一个 ACAO，而且是具体来源不是 *。
    const stub = stubUpstream(() => upstreamJson({ translation: '如是我聞' }));
    try {
        const response = await worker.fetch(
            request('/mitra/translate', { body: { input_chinese: '如是我聞', target_language: 'english' } }),
            {}
        );

        assert.equal(response.status, 200);
        // 中转出去的响应必须只带一个 ACAO，而且是具体来源不是 *。
        // Headers 会把重复项用 ", " 拼起来，所以值里出现逗号就说明发重了。
        const acao = response.headers.get('Access-Control-Allow-Origin');
        assert.equal(acao, ALLOWED_ORIGIN);
        assert.doesNotMatch(acao, /,/, 'a duplicated ACAO is exactly what browsers reject');
    } finally {
        stub.restore();
    }
});

test('/mitra/translate forwards only the known fields and normalises the rest', async () => {
    const stub = stubUpstream(() => upstreamJson({ translation: '  Thus have I heard.  ' }));
    try {
        const response = await worker.fetch(request('/mitra/translate', {
            body: {
                input_chinese: '  如是我聞  ',
                input_sanskrit: 'evaṃ mayā śrutam',
                target_language: 'english',
                focus: 'sanskrit',
                context: 'glossary',
                style_instruction: 'hyper-literal',
                // 未知字段不该被透传，否则这里就成了开放代理
                model: 'evil',
                api_key: 'leak'
            }
        }), {});

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { translation: 'Thus have I heard.' });

        const sent = stub.calls[0].body;
        assert.equal(stub.calls[0].url, 'https://dharmamitra.org/api-search/cat-translate/v1/translate');
        assert.equal(sent.input_chinese, '如是我聞');
        assert.equal(sent.input_sanskrit, 'evaṃ mayā śrutam');
        assert.equal(sent.input_tibetan, '');
        assert.equal(sent.input_pali, '');
        assert.equal(sent.focus, 'sanskrit');
        assert.equal(sent.style_instruction, 'hyper-literal');
        assert.equal('model' in sent, false);
        assert.equal('api_key' in sent, false);
    } finally {
        stub.restore();
    }
});

test('/mitra/translate rejects a bogus focus instead of passing it upstream', async () => {
    const stub = stubUpstream(() => upstreamJson({ translation: 'x' }));
    try {
        await worker.fetch(request('/mitra/translate', {
            body: { input_chinese: '如是我聞', target_language: 'english', focus: 'nonsense' }
        }), {});
        assert.equal(stub.calls[0].body.focus, 'equal');
    } finally {
        stub.restore();
    }
});

test('/mitra/translate validates its inputs before calling upstream', async () => {
    const stub = stubUpstream(() => upstreamJson({ translation: 'x' }));
    try {
        const noWitness = await worker.fetch(
            request('/mitra/translate', { body: { input_chinese: '   ', target_language: 'english' } }),
            {}
        );
        assert.equal(noWitness.status, 400);
        assert.match((await noWitness.json()).error, /至少需要一路写本原文/);

        const noTarget = await worker.fetch(
            request('/mitra/translate', { body: { input_chinese: '如是我聞' } }),
            {}
        );
        assert.equal(noTarget.status, 400);
        assert.match((await noTarget.json()).error, /target_language/);

        const wrongType = await worker.fetch(request('/mitra/translate', {
            body: { input_chinese: '如是我聞', target_language: 'english' },
            headers: { 'Content-Type': 'text/plain' }
        }), {});
        assert.equal(wrongType.status, 415);

        assert.equal(stub.calls.length, 0, 'invalid requests must not reach the upstream service');
    } finally {
        stub.restore();
    }
});

test('/mitra/translate surfaces upstream failures without leaking details', async () => {
    const stub = stubUpstream(() => upstreamJson({ detail: 'internal stack trace' }, 500));
    try {
        const response = await worker.fetch(
            request('/mitra/translate', { body: { input_chinese: '如是我聞', target_language: 'english' } }),
            {}
        );
        assert.equal(response.status, 500);
        const payload = await response.json();
        assert.match(payload.error, /MITRA 服务错误: 500/);
        assert.doesNotMatch(JSON.stringify(payload), /stack trace/);
    } finally {
        stub.restore();
    }
});

test('/mitra/translate rejects a blank translation as a format error', async () => {
    const stub = stubUpstream(() => upstreamJson({ translation: '   ' }));
    try {
        const response = await worker.fetch(
            request('/mitra/translate', { body: { input_chinese: '如是我聞', target_language: 'english' } }),
            {}
        );
        assert.equal(response.status, 502);
    } finally {
        stub.restore();
    }
});

test('/mitra/search disables the browser ranker and strips the heavy fields', async () => {
    const stub = stubUpstream(() => upstreamJson({
        results: [
            {
                segmentnr: 'ZH_T08_0251_001:0848c07',
                lang: 'zh',
                source: 'ZH_T08_0251',
                title: '般若波羅蜜多心經',
                text: '  觀自在菩薩\n行深般若波羅蜜多時 ',
                src_link: 'https://dharmamitra.org/nexus/db/zh/ZH_T08_0251/text',
                vector: [0.1, 0.2],
                text_new: { junk: true }
            }
        ]
    }));
    try {
        const response = await worker.fetch(request('/mitra/search', {
            body: { search_input: ' 照見五蘊皆空 ', filter_source_language: 'zh' }
        }), {});

        assert.equal(response.status, 200);
        const { results } = await response.json();

        assert.equal(stub.calls[0].url, 'https://dharmamitra.org/api-search/primary/');
        assert.equal(stub.calls[0].body.search_input, '照見五蘊皆空');
        assert.equal(stub.calls[0].body.do_ranking, false);
        assert.equal(stub.calls[0].body.filter_source_language, 'zh');

        assert.equal(results.length, 1);
        assert.equal(results[0].text, '觀自在菩薩 行深般若波羅蜜多時');
        assert.equal(results[0].src_link, 'https://dharmamitra.org/nexus/db/zh/ZH_T08_0251/text');
        // vector 是几百个浮点数，绝不能发到浏览器
        assert.equal('vector' in results[0], false);
        assert.equal('text_new' in results[0], false);
    } finally {
        stub.restore();
    }
});

test('/mitra/search clamps the requested result count', async () => {
    const many = Array.from({ length: 60 }, (unused, index) => ({
        segmentnr: `ZH_T08_0251_001:${index}`,
        text: `段落 ${index}`,
        src_link: 'https://dharmamitra.org/x'
    }));
    const stub = stubUpstream(() => upstreamJson({ results: many }));
    try {
        const response = await worker.fetch(
            request('/mitra/search', { body: { search_input: '空', limit: 500 } }),
            {}
        );
        const { results } = await response.json();
        assert.equal(results.length, 20);
    } finally {
        stub.restore();
    }
});

test('/mitra/search requires a query and rejects an unknown language filter value', async () => {
    const stub = stubUpstream(() => upstreamJson({ results: [] }));
    try {
        const empty = await worker.fetch(request('/mitra/search', { body: { search_input: '  ' } }), {});
        assert.equal(empty.status, 400);
        assert.equal(stub.calls.length, 0);

        await worker.fetch(
            request('/mitra/search', { body: { search_input: '空', filter_source_language: 'klingon' } }),
            {}
        );
        assert.equal(stub.calls[0].body.filter_source_language, 'all');
    } finally {
        stub.restore();
    }
});

test('MITRA endpoints reject unlisted origins and non-POST methods', async () => {
    const stub = stubUpstream(() => upstreamJson({ translation: 'x' }));
    try {
        const badOrigin = await worker.fetch(request('/mitra/translate', {
            origin: 'https://evil.example',
            body: { input_chinese: '如是我聞', target_language: 'english' }
        }), {});
        assert.equal(badOrigin.status, 403);

        const badMethod = await worker.fetch(request('/mitra/search', { method: 'GET' }), {});
        assert.equal(badMethod.status, 405);
        assert.equal(badMethod.headers.get('Allow'), 'POST, OPTIONS');

        assert.equal(stub.calls.length, 0);
    } finally {
        stub.restore();
    }
});

test('MITRA endpoints consume the same rate limit as the DeepSeek route', async () => {
    const stub = stubUpstream(() => upstreamJson({ translation: 'x' }));
    const store = new Map();
    const env = {
        RATE_LIMIT_KV: {
            async get(key) { return store.get(key) ?? null; },
            async put(key, value) { store.set(key, JSON.parse(value)); }
        }
    };
    try {
        let lastStatus = 0;
        for (let i = 0; i < 31; i += 1) {
            const response = await worker.fetch(request('/mitra/translate', {
                body: { input_chinese: `如是我聞 ${i}`, target_language: 'english' },
                headers: { 'CF-Connecting-IP': '203.0.113.9' }
            }), env);
            lastStatus = response.status;
            if (response.status === 429) {
                assert.ok(Number(response.headers.get('Retry-After')) > 0);
                break;
            }
        }
        assert.equal(lastStatus, 429, 'the 31st request in a minute should be rate limited');
        assert.equal(stub.calls.length, 30);
    } finally {
        stub.restore();
    }
});
