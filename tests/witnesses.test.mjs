import assert from 'node:assert/strict';
import test from 'node:test';

const { fetchWitnesses, describeWitnessMiss, WITNESS_MISS, witnessesAvailable } =
    await import('../src/witnesses.js');
const config = await import('../src/config.js');

function withProxy(url, run) {
    const previous = config.API_CONFIG.proxyURL;
    config.API_CONFIG.proxyURL = url;
    return Promise.resolve(run()).finally(() => { config.API_CONFIG.proxyURL = previous; });
}

const OK = {
    found: true,
    source: { cbeta_id: 'T1579', title: '瑜伽師地論', juan: 42 },
    witnesses: { sa: 'sanskrit here', bo: '藏文', pi: '' },
    counts: { total: 685, facing: 29 }
};

test('fetchWitnesses returns only the witnesses that actually have text', async () => {
    await withProxy('https://relay.example', async () => {
        const result = await fetchWitnesses('云何菩薩善士精進', async () => new Response(JSON.stringify(OK)));

        assert.equal(result.found, true);
        assert.deepEqual(Object.keys(result.witnesses).sort(), ['bo', 'sa']);
        // 空字符串填进输入框只会让人以为坏了
        assert.ok(!('pi' in result.witnesses));
    });
});

/*
 * 没有中转时**不能**退回直连：fojin 的 MCP 对任何带 Origin 的请求一律 403，
 * 直连必定失败，而且失败得很难懂。这条钉住我们根本不发那个请求。
 */
test('fetchWitnesses does not attempt a direct call when no relay is configured', async () => {
    await withProxy('', async () => {
        let called = false;
        const result = await fetchWitnesses('云何菩薩善士精進', async () => { called = true; return new Response('{}'); });

        assert.equal(result.found, false);
        assert.equal(result.reason, WITNESS_MISS.NO_PROXY);
        assert.equal(called, false, 'a direct call to fojin would 403');
    });
});

test('fetchWitnesses passes the upstream miss reason through so the UI can explain it', async () => {
    await withProxy('https://relay.example', async () => {
        const result = await fetchWitnesses('不在语料里', async () =>
            new Response(JSON.stringify({ found: false, reason: 'not-located', similarity: 0.47 })));

        assert.equal(result.reason, WITNESS_MISS.NOT_LOCATED);
    });
});

test('fetchWitnesses treats an all-empty witness set as no parallel, not as success', async () => {
    await withProxy('https://relay.example', async () => {
        const result = await fetchWitnesses('某段', async () =>
            new Response(JSON.stringify({ ...OK, witnesses: { sa: '', bo: '   ', pi: '' } })));

        assert.equal(result.found, false);
        assert.equal(result.reason, WITNESS_MISS.NO_PARALLEL);
    });
});

test('fetchWitnesses survives a network failure and a non-JSON body', async () => {
    await withProxy('https://relay.example', async () => {
        const thrown = await fetchWitnesses('某段', async () => { throw new Error('offline'); });
        assert.equal(thrown.reason, WITNESS_MISS.FAILED);

        const garbage = await fetchWitnesses('某段', async () => new Response('<html>'));
        assert.equal(garbage.reason, WITNESS_MISS.FAILED);
    });
});

/*
 * 覆盖率行级密度中位数只有 16%，「取不到」是常态而非异常。
 * 每种「没有」必须给出不同的说法，否则用户无从判断是自己贴错了还是语料没有。
 */
test('describeWitnessMiss says which kind of nothing it was', () => {
    const messages = [
        describeWitnessMiss(WITNESS_MISS.NO_PROXY),
        describeWitnessMiss(WITNESS_MISS.NOT_LOCATED),
        describeWitnessMiss(WITNESS_MISS.NO_PARALLEL, { title: '瑜伽師地論' }),
        describeWitnessMiss(WITNESS_MISS.FAILED)
    ];

    assert.equal(new Set(messages).size, messages.length, 'each miss needs its own wording');
    assert.match(messages[2], /瑜伽師地論/, 'name the text we did manage to locate');
    for (const message of messages) assert.ok(message.length > 10);
});

test('witnessesAvailable reflects whether a relay is configured', async () => {
    await withProxy('', () => assert.equal(witnessesAvailable(), false));
    await withProxy('https://relay.example', () => assert.equal(witnessesAvailable(), true));
});
