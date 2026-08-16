import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker/worker.js';

const ALLOWED_ORIGIN = 'https://xr843.github.io';

function request(path, body) {
    return new Request(`https://translator-worker.example${path}`, {
        method: 'POST',
        headers: { Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

/** fojin 的 MCP 用 JSON-RPC，结果是塞在 content[0].text 里的 JSON 字符串。 */
function mcpReply(payload) {
    return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ text: JSON.stringify(payload) }] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

/**
 * 按工具名派发的假上游，并记录每次调用，好断言我们发出去的是什么。
 * fetch 的第一个参数是 URL，payload 在 init.body 里。
 */
function stubFojin(byTool) {
    const calls = [];
    const original = globalThis.fetch;

    globalThis.fetch = async (url, init) => {
        const sent = JSON.parse(init.body);
        calls.push({ url: String(url), tool: sent?.params?.name, args: sent?.params?.arguments, headers: init.headers });
        const handler = byTool[sent?.params?.name];
        if (!handler) return new Response('not stubbed', { status: 404 });
        return handler(sent.params.arguments);
    };

    return { calls, restore: () => { globalThis.fetch = original; } };
}

const LOCATED = {
    verbatim: true,
    similarity: 1.0,
    matches: [{ text_id: 43, juan_num: 42, cbeta_id: 'T1579', title_zh: '瑜伽師地論', urn: 'fojin:cbeta/T1579.42' }]
};

// 源 chunk 的文本带标点，用户粘的那段不带——两侧都归一化才匹配得上
const ALIGNED = {
    source: { text_id: 43, juan_num: 42, total_chunks: 3, chunks_with_parallels: 2 },
    source_chunks: [
        { chunk_index: 0, text: '前面一段。與此無關。' },
        { chunk_index: 16, text: '云何菩薩善士精進？謂此精進略有五種。' }
    ],
    parallels: [
        { lang: 'bo', text: '藏文甲', aligns_source_chunk: 16 },
        { lang: 'sa', text: 'sanskrit A', aligns_source_chunk: 16 },
        { lang: 'bo', text: '别的 chunk 的藏文', aligns_source_chunk: 0 }
    ]
};

test('POST /fojin/witnesses narrows a fascicle of parallels down to the pasted passage', async (t) => {
    const stub = stubFojin({
        verify_quote: () => mcpReply(LOCATED),
        get_parallels: () => mcpReply(ALIGNED)
    });
    t.after(stub.restore);

    // 用户粘的原文没有标点，源 chunk 里有——归一化必须两侧都做
    const response = await worker.fetch(
        request('/fojin/witnesses', { text: '云何菩薩善士精進謂此精進略有五種' }),
        {}
    );
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.found, true);
    assert.equal(data.source.cbeta_id, 'T1579');
    // 只保留面向这一段的，别的 chunk 的不能混进来
    assert.equal(data.witnesses.bo, '藏文甲');
    assert.equal(data.witnesses.sa, 'sanskrit A');
    assert.equal(data.counts.facing, 2);

    assert.deepEqual(stub.calls.map(call => call.tool), ['verify_quote', 'get_parallels']);
    assert.deepEqual(stub.calls[1].args, { text_id: 43, juan_num: 42 });
});

/*
 * 这条守的是「不能是一个空着的框」：定位失败最常见的原因是这段横跨了
 * fojin 的 chunk 边界，不是语料里没有。必须照实回报，界面才能说人话。
 */
test('POST /fojin/witnesses reports why it found nothing instead of returning blanks', async (t) => {
    const stub = stubFojin({
        verify_quote: () => mcpReply({ verbatim: false, similarity: 0.47, matches: [] })
    });
    t.after(stub.restore);

    const response = await worker.fetch(request('/fojin/witnesses', { text: '不在语料里的一段文字' }), {});
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.found, false);
    assert.equal(data.reason, 'not-located');
    assert.equal(data.similarity, 0.47);
    assert.equal(stub.calls.length, 1, 'a failed locate must not go on to fetch parallels');
});

test('POST /fojin/witnesses distinguishes “located but no parallel” from “not located”', async (t) => {
    const stub = stubFojin({
        verify_quote: () => mcpReply(LOCATED),
        get_parallels: () => mcpReply({ ...ALIGNED, source_chunks: [{ chunk_index: 0, text: '完全不同的文字' }] })
    });
    t.after(stub.restore);

    const response = await worker.fetch(request('/fojin/witnesses', { text: '云何菩薩善士精進' }), {});
    const data = await response.json();

    assert.equal(data.found, false);
    assert.equal(data.reason, 'no-parallel');
    assert.equal(data.source.cbeta_id, 'T1579', 'we still know which text it was');
});

/*
 * fojin 的 MCP 对**任何**带 Origin 的请求一律 403（2026-08-16 实测），
 * 中转的意义正在于以服务端身份去调。转发浏览器的 Origin 会让整条路死掉。
 */
test('the relay does not forward the browser Origin upstream', async (t) => {
    const stub = stubFojin({
        verify_quote: () => mcpReply(LOCATED),
        get_parallels: () => mcpReply(ALIGNED)
    });
    t.after(stub.restore);

    await worker.fetch(request('/fojin/witnesses', { text: '云何菩薩善士精進謂此精進略有五種' }), {});

    for (const call of stub.calls) {
        const headers = new Headers(call.headers);
        assert.equal(headers.get('Origin'), null, 'Origin must not reach fojin');
        assert.match(headers.get('Accept') || '', /text\/event-stream/, 'the MCP endpoint needs this Accept');
    }
});

test('POST /fojin/witnesses rejects an empty passage before calling upstream', async (t) => {
    const stub = stubFojin({});
    t.after(stub.restore);

    const response = await worker.fetch(request('/fojin/witnesses', { text: '   ' }), {});

    assert.equal(response.status, 400);
    assert.equal(stub.calls.length, 0);
});

test('GET /fojin/witnesses is rejected with an Allow header', async () => {
    const response = await worker.fetch(
        new Request('https://translator-worker.example/fojin/witnesses', {
            method: 'GET',
            headers: { Origin: ALLOWED_ORIGIN }
        }),
        {}
    );

    assert.equal(response.status, 405);
    assert.match(response.headers.get('Allow') || '', /POST/);
});
