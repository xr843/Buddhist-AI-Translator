import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelityRules } from '../src/style.js';

/*
 * 保真规则是「怎么译都不该错」的东西，不是偏好，所以任何译风组合下都必须在场。
 * 这四条来自 2026-08-15 与 foguang.ai 的四段对照——我方输的四处全在这一层。
 * 谁把它们做成可开关的维度，这条会红。
 */
test('fidelity rules survive every style combination', async () => {
    const { STYLE_DIMENSIONS, buildStyleInstruction } = await import('../src/style.js');
    const en = fidelityRules('en');

    assert.equal(en.length, 5, "expected the five measured fidelity rules");
    assert.equal(fidelityRules("zh").length, 5);

    for (const [key, spec] of Object.entries(STYLE_DIMENSIONS)) {
        for (const option of spec.options) {
            const instruction = buildStyleInstruction({ [key]: option.value });
            for (const rule of en) {
                assert.ok(
                    instruction.includes(rule),
                    `${key}=${option.value} dropped a fidelity rule: ${rule.slice(0, 48)}…`
                );
            }
        }
    }
});

/*
 * 合参规则只在真送了多路写本时才该出现。单本时附上它是有害的——
 * 那段话说「其他写本只用于消歧」，而单本时根本没有其他写本，纯属噪音。
 */
test('the multi-witness rule appears only when more than one witness is sent', async () => {
    const { multiWitnessRule } = await import('../src/style.js');

    assert.equal(multiWitnessRule(0), '');
    assert.equal(multiWitnessRule(1), '', 'a single witness must not trigger the multi-witness rule');
    assert.ok(multiWitnessRule(2).length > 80, 'two witnesses should trigger it');
    assert.equal(multiWitnessRule(4), multiWitnessRule(2), 'the rule text should not vary by count');

    // 它守的是实测出来的两个副作用，措辞里必须留着这两点
    assert.match(multiWitnessRule(2), /primary witness/i, 'must name a primary witness');
    assert.match(multiWitnessRule(2), /not derive .*Indic term/i, 'must forbid back-forming Indic terms');
    assert.doesNotMatch(multiWitnessRule(2), /[一-鿿]/, 'read verbatim by the English-side model');
});

test('the English fidelity rules stay free of CJK', () => {
    // style_instruction 由英文侧模型逐字照读，混入汉字会被当成待译内容
    for (const rule of fidelityRules('en')) {
        assert.doesNotMatch(rule, /[一-鿿]/, `CJK leaked into an English rule: ${rule}`);
    }
    for (const rule of fidelityRules('zh')) {
        assert.match(rule, /[一-鿿]/);
    }
});


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
