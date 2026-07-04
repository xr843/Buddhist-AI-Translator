import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = {
    createElement() {
        return {
            textContent: '',
            get innerHTML() {
                return this.textContent;
            }
        };
    },
    body: {
        appendChild() {}
    }
};

const utils = await import('../src/utils.js');

test('limitTextLength reports the displayed length after truncation', () => {
    assert.deepEqual(utils.limitTextLength('abc', 5), {
        text: 'abc',
        length: 3,
        truncated: false
    });

    assert.deepEqual(utils.limitTextLength('abcdef', 5), {
        text: 'abcde',
        length: 5,
        truncated: true
    });

    assert.deepEqual(utils.limitTextLength('abcde', 5), {
        text: 'abcde',
        length: 5,
        truncated: false
    });
});
