import test from 'node:test';
import assert from 'node:assert/strict';

const {
    STYLE_DIMENSIONS,
    buildStyleDirectives,
    buildStyleInstruction,
    defaultStyle,
    describeStyle,
    normalizeStyle
} = await import('../src/style.js');

test('every style dimension declares a default that is one of its own options', () => {
    for (const [key, spec] of Object.entries(STYLE_DIMENSIONS)) {
        assert.ok(spec.label, `${key} needs a label`);
        assert.ok(spec.options.length >= 2, `${key} needs at least two options`);
        assert.ok(
            spec.options.some(option => option.value === spec.default),
            `${key} default "${spec.default}" is not among its options`
        );
    }
});

test('normalizeStyle falls back to defaults for missing or bogus values', () => {
    assert.deepEqual(normalizeStyle({}), defaultStyle());
    assert.deepEqual(normalizeStyle(null), defaultStyle());
    assert.deepEqual(normalizeStyle({ literalness: 'nonsense' }), defaultStyle());

    const custom = normalizeStyle({ literalness: 'literal', register: 'academic' });
    assert.equal(custom.literalness, 'literal');
    assert.equal(custom.register, 'academic');
    assert.equal(custom.category, STYLE_DIMENSIONS.category.default);
});

test('buildStyleInstruction covers every dimension and changes with each choice', () => {
    const base = buildStyleInstruction(defaultStyle());
    assert.ok(base.length > 80, 'the instruction should be prose, not a tag');

    // 每一维改一次，指令都必须真的变化，否则界面上的选择是摆设
    for (const [key, spec] of Object.entries(STYLE_DIMENSIONS)) {
        const other = spec.options.find(option => option.value !== spec.default);
        const changed = buildStyleInstruction({ ...defaultStyle(), [key]: other.value });
        assert.notEqual(changed, base, `changing ${key} did not change the style instruction`);
    }
});

test('buildStyleInstruction is English prose because MITRA reads it verbatim', () => {
    const instruction = buildStyleInstruction(defaultStyle());
    assert.doesNotMatch(instruction, /[一-鿿]/, 'style_instruction is read verbatim by an English-side model');
});

test('buildStyleDirectives returns one Chinese line per dimension', () => {
    const directives = buildStyleDirectives(defaultStyle());
    assert.equal(directives.length, Object.keys(STYLE_DIMENSIONS).length);
    for (const line of directives) {
        assert.match(line, /[一-鿿]/);
    }

    const literal = buildStyleDirectives({ ...defaultStyle(), literalness: 'literal' });
    assert.notDeepEqual(literal, directives);
});

test('describeStyle produces a readable one-line summary', () => {
    const summary = describeStyle({ literalness: 'literal', register: 'academic' });
    assert.match(summary, /严格直译/);
    assert.match(summary, /学术/);
    assert.match(summary, / · /);
});
