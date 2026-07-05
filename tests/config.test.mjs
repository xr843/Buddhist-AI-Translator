import assert from 'node:assert/strict';
import test from 'node:test';

test('config falls back to an empty API key when localStorage is unavailable', async (t) => {
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
        getItem() {
            throw new Error('storage unavailable');
        }
    };
    t.after(() => {
        if (originalLocalStorage === undefined) {
            delete globalThis.localStorage;
        } else {
            globalThis.localStorage = originalLocalStorage;
        }
    });

    const config = await import(`../src/config.js?storage-unavailable=${Date.now()}`);

    assert.equal(config.API_CONFIG.apiKey, '');
});

test('config normalizes stored API keys from localStorage', async (t) => {
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
        getItem() {
            return '  sk-persisted\n';
        }
    };
    t.after(() => {
        if (originalLocalStorage === undefined) {
            delete globalThis.localStorage;
        } else {
            globalThis.localStorage = originalLocalStorage;
        }
    });

    const config = await import(`../src/config.js?storage-trim=${Date.now()}`);

    assert.equal(config.API_CONFIG.apiKey, 'sk-persisted');
});

test('storeApiKey reports storage failures while updating the in-memory key', async (t) => {
    const originalLocalStorage = globalThis.localStorage;
    const writes = [];
    globalThis.localStorage = {
        getItem() {
            return '';
        },
        setItem(key, value) {
            writes.push([key, value]);
            throw new Error('storage denied');
        }
    };
    t.after(() => {
        if (originalLocalStorage === undefined) {
            delete globalThis.localStorage;
        } else {
            globalThis.localStorage = originalLocalStorage;
        }
    });

    const config = await import(`../src/config.js?storage-write-denied=${Date.now()}`);
    const stored = config.storeApiKey('sk-current-session');

    assert.equal(stored, false);
    assert.deepEqual(writes, [['deepseek_api_key', 'sk-current-session']]);
    assert.equal(config.API_CONFIG.apiKey, 'sk-current-session');
});

test('storeApiKey trims keys before persistence and in-memory use', async (t) => {
    const originalLocalStorage = globalThis.localStorage;
    const writes = [];
    globalThis.localStorage = {
        getItem() {
            return '';
        },
        setItem(key, value) {
            writes.push([key, value]);
        }
    };
    t.after(() => {
        if (originalLocalStorage === undefined) {
            delete globalThis.localStorage;
        } else {
            globalThis.localStorage = originalLocalStorage;
        }
    });

    const config = await import(`../src/config.js?storage-save-trim=${Date.now()}`);
    const stored = config.storeApiKey('  sk-current-session\n');

    assert.equal(stored, true);
    assert.deepEqual(writes, [['deepseek_api_key', 'sk-current-session']]);
    assert.equal(config.API_CONFIG.apiKey, 'sk-current-session');
});

test('proxy URL helpers trim configured values and ignore blank strings', async (t) => {
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
        getItem() {
            return '';
        }
    };
    t.after(() => {
        if (originalLocalStorage === undefined) {
            delete globalThis.localStorage;
        } else {
            globalThis.localStorage = originalLocalStorage;
        }
    });

    const config = await import(`../src/config.js?proxy-normalize=${Date.now()}`);

    config.API_CONFIG.proxyURL = ' https://translator-worker.example/ ';
    assert.equal(config.getProxyURL(), 'https://translator-worker.example');
    assert.equal(config.hasProxyURL(), true);

    config.API_CONFIG.proxyURL = '   ';
    assert.equal(config.getProxyURL(), '');
    assert.equal(config.hasProxyURL(), false);
});
