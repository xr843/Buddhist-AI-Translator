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

/*
 * 版权年份。硬编码一个年份必然过期 —— 2026-08-17 页脚上写的还是 2025，
 * 是用户截图指出来的，不是任何测试发现的。所以这里既测算法，也在
 * tests/static-site.test.mjs 里钉住「HTML 不许再写死完整年份」。
 */
test('copyrightYears joins the start year to the current one, and never runs backwards', () => {
    assert.equal(utils.copyrightYears(2025, 2026), '2025–2026');
    assert.equal(utils.copyrightYears(2025, 2030), '2025–2030');

    // 同一年只写一个年份，不写 2025–2025
    assert.equal(utils.copyrightYears(2025, 2025), '2025');

    // 系统时钟被往前调过，或者根本没设好 —— 宁可只显示起始年，
    // 也不能显示成 2025–2024 这种一眼假的东西
    assert.equal(utils.copyrightYears(2025, 2024), '2025');
    assert.equal(utils.copyrightYears(2025, Number.NaN), '2025');
    assert.equal(utils.copyrightYears(2025, undefined), '2025');

    // 起始年本身算不出来时返回空串，调用方据此保留 HTML 里的兜底值
    assert.equal(utils.copyrightYears(Number.NaN, 2026), '');
    assert.equal(utils.copyrightYears(undefined, 2026), '');

    // 字符串也要吃得下（HTML 里取出来的都是字符串）
    assert.equal(utils.copyrightYears('2025', '2026'), '2025–2026');

    // 用的是短横线 en dash，不是连字符
    assert.ok(utils.copyrightYears(2025, 2026).includes('–'));
    assert.ok(!utils.copyrightYears(2025, 2026).includes('-'));
});
