import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { DailyBudget } from '../worker/worker.js';

const ORIGIN = 'https://xr843.github.io';

function memoryStorage() {
    const map = new Map();
    return {
        map,
        async get(key) { return map.get(key); },
        async put(key, value) { map.set(key, value); },
        async deleteAll() { map.clear(); }
    };
}

// 用真的 DailyBudget 类 + 内存存储，模拟 Durable Object 命名空间。
function budgetNamespace() {
    const storage = memoryStorage();
    const instance = new DailyBudget({ storage });
    return {
        storage,
        idFromName: (name) => name,
        get: () => ({
            fetch: (url, init) => instance.fetch(new Request(url, init))
        })
    };
}

function brokenNamespace() {
    return {
        idFromName: (name) => name,
        get: () => ({
            fetch: async () => { throw new Error('durable object unavailable'); }
        })
    };
}

function post(path, body) {
    return new Request(`https://translator-worker.example${path}`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify(body)
    });
}

const translateBody = { text: 'sabbe sankhara anicca', sourceLang: 'pi', targetLang: 'zh' };
const mitraBody = { input_tibetan: 'chos', target_language: 'chinese' };

function deepseekOk() {
    return new Response(JSON.stringify({ choices: [{ message: { content: '诸行无常' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

test('DeepSeek stops being called once the daily cap is reached', async (t) => {
    const originalFetch = globalThis.fetch;
    let upstreamCalls = 0;
    globalThis.fetch = async () => { upstreamCalls += 1; return deepseekOk(); };
    t.after(() => { globalThis.fetch = originalFetch; });

    const env = { DEEPSEEK_API_KEY: 'k', DAILY_BUDGET: budgetNamespace(), DAILY_LIMIT_DEEPSEEK: '3' };

    for (let i = 0; i < 3; i += 1) {
        const ok = await worker.fetch(post('/translate', translateBody), env);
        assert.equal(ok.status, 200, `call ${i + 1} should pass`);
    }
    const blocked = await worker.fetch(post('/translate', translateBody), env);
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /总额度已用完/);
    const retryAfter = Number(blocked.headers.get('Retry-After'));
    assert.ok(retryAfter >= 1 && retryAfter <= 86400, `Retry-After ${retryAfter} should point at next Beijing midnight`);
    assert.equal(upstreamCalls, 3, 'the 4th request must not reach DeepSeek');
});

test('buckets are independent: exhausting DeepSeek does not block MITRA', async (t) => {
    const originalFetch = globalThis.fetch;
    const hits = [];
    globalThis.fetch = async (url) => {
        hits.push(String(url));
        if (String(url).includes('deepseek')) return deepseekOk();
        return new Response(JSON.stringify({ translation: 'x' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const env = { DEEPSEEK_API_KEY: 'k', DAILY_BUDGET: budgetNamespace(), DAILY_LIMIT_DEEPSEEK: '0', DAILY_LIMIT_MITRA: '1' };

    assert.equal((await worker.fetch(post('/translate', translateBody), env)).status, 429);
    assert.equal((await worker.fetch(post('/mitra/translate', mitraBody), env)).status, 200);
    assert.equal((await worker.fetch(post('/mitra/translate', mitraBody), env)).status, 429);
    assert.equal(hits.filter((u) => u.includes('deepseek')).length, 0);
    assert.equal(hits.filter((u) => u.includes('dharmamitra')).length, 1);
});

test('a broken counter fails closed for DeepSeek (money) and open for MITRA (free)', async (t) => {
    const originalFetch = globalThis.fetch;
    const hits = [];
    globalThis.fetch = async (url) => {
        hits.push(String(url));
        return new Response(JSON.stringify({ translation: 'x' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const env = { DEEPSEEK_API_KEY: 'k', DAILY_BUDGET: brokenNamespace() };

    assert.equal((await worker.fetch(post('/translate', translateBody), env)).status, 503);
    assert.equal(hits.filter((u) => u.includes('deepseek')).length, 0);
    assert.equal((await worker.fetch(post('/mitra/translate', mitraBody), env)).status, 200);
});

test('counter resets when the Beijing date changes', async () => {
    const storage = memoryStorage();
    const budget = new DailyBudget({ storage });
    const consume = (day) => budget.fetch(new Request('https://daily-budget/consume', {
        method: 'POST',
        body: JSON.stringify({ bucket: 'deepseek', day, limit: 1 })
    })).then((r) => r.json());

    assert.equal((await consume('2026-11-19')).allowed, true);
    assert.equal((await consume('2026-11-19')).allowed, false);
    assert.equal((await consume('2026-11-20')).allowed, true);
    assert.equal(storage.map.size, 2, 'old day keys are dropped (day + one bucket)');
});
