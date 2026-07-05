import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem() {
    return '';
  },
  setItem() {},
  removeItem() {}
};

test('browser modules can be imported by the test harness', async () => {
  const [config, translator, utils, speech, ui] = await Promise.all([
    import('../src/config.js'),
    import('../src/translator.js'),
    import('../src/utils.js'),
    import('../src/speech.js'),
    import('../src/ui.js')
  ]);

  assert.equal(config.API_CONFIG.provider, 'deepseek');
  assert.equal(typeof translator.translateWithDeepSeek, 'function');
  assert.equal(typeof utils.escapeHtml, 'function');
  assert.equal(typeof speech.initSpeech, 'function');
  assert.equal(typeof ui.initializeUI, 'function');
});

test('browser entrypoint registers startup with a minimal DOM stub', async (t) => {
  const originalDocument = globalThis.document;
  const listeners = [];

  globalThis.document = {
    addEventListener(type, listener) {
      listeners.push({ type, listener });
    }
  };

  t.after(() => {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  await import(`../src/main.js?syntax-entrypoint=${Date.now()}`);

  assert.deepEqual(
    listeners.map(({ type }) => type),
    ['DOMContentLoaded']
  );
  assert.equal(typeof listeners[0].listener, 'function');
});
