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
