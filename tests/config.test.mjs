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
