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

test('escapeHtml encodes HTML control characters without relying on the DOM', () => {
    assert.equal(
        utils.escapeHtml('<script>alert("x")</script> & \'quote\''),
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quote&#39;'
    );
    assert.equal(utils.escapeHtml(null), '');
});

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

test('validateInput preserves ordinary prose containing equals signs', () => {
    assert.equal(
        utils.validateInput('one = one; condition = cause'),
        'one = one; condition = cause'
    );
});

test('validateInput strips dangerous HTML while preserving safe text', () => {
    assert.equal(utils.validateInput('before <script>alert("x")</script> after'), 'before  after');
    assert.equal(utils.validateInput('<img src="x" onerror="alert(1)">'), '<img src="x">');
    assert.equal(utils.validateInput('<button onclick=alert(1)>Click</button>'), '<button>Click</button>');
});
