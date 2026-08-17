/*
 * 给 eval/auto-metrics.mjs 的探测器做变异测试。
 *
 * 为什么这组测试值得进 npm run verify：auto-metrics 报出来的每一个 0
 * 都会被当成「这一臂没有违规」的证据。而一个永远不响的探测器报出来的也是 0，
 * 两者从报表上看一模一样。写这个文件的时候就撞上一个——
 * `/\b(?:i\.e\.)\b/` 里结尾那个 \b 让它永远匹配不上，喂 "i.e. materiality" 也不响。
 *
 * 所以每条探测器都要有一对：**喂已知坏值必须响，喂干净值必须不响**。
 * 只测「不误报」不算数——那正是摆设能通过的那一半。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    noteViolations,
    parenSentenceViolations,
    missingNumerals,
    missingStock,
    sourceNumerals
} from '../eval/auto-metrics.mjs';

test('the appended-note detector fires on every note shape it claims to catch', () => {
    const mustFire = [
        'He went forth. Note: this echoes the Pali parallel.',
        'The five aggregates are empty. cf. SN 22.59.',
        'Thus it is taught. This passage corresponds to a Pali parallel.',
        'form (rūpa), i.e. materiality',          // 结尾标点 + \b 的老陷阱
        'the aggregate of form, e.g. the four elements',
        'Translator note: the term is ambiguous.',
        'The Tibetan version reads differently here.',
        'In the Pali parallel the simile is reversed.',
        'The word here means something else entirely.'
    ];
    for (const text of mustFire) {
        assert.ok(noteViolations(text).length > 0, `should have flagged an appended note: ${text}`);
    }
});

test('the appended-note detector stays quiet on ordinary translation prose', () => {
    const mustNotFire = [
        'The five aggregates are impermanent, and so is consciousness (vijñāna).',
        'Thus have I heard. At one time the Blessed One was dwelling at Sāvatthī.',
        'He noted the arising and passing away of feeling.',   // "noted" 不是 "Note:"
        'This is the noble truth of suffering.'                // "This is" 不是 "This passage"
    ];
    for (const text of mustNotFire) {
        assert.deepEqual(noteViolations(text), [], `false positive on: ${text}`);
    }
});

test('the parenthesis detector separates a glossed term from a smuggled sentence', () => {
    assert.ok(
        parenSentenceViolations('form (this term refers to material shape in general)').length > 0,
        'a sentence inside parentheses violates rule 6'
    );
    assert.ok(
        parenSentenceViolations('the raft (the simile is well known.)').length > 0,
        'sentence-final punctuation inside parentheses is a give-away'
    );
    assert.deepEqual(
        parenSentenceViolations('wisdom (prajñā) and the five aggregates (pañca skandha)'),
        [],
        'a bare term — which the style setting explicitly asks for — must not be flagged'
    );
});

test('the numeral detector catches a dropped doctrinal count without flagging 一切', () => {
    assert.deepEqual(
        missingNumerals('觀五蘊皆空', 'He saw that the aggregates are empty'),
        ['五'],
        'dropping "five" from 五蘊 is exactly what rule 3 forbids'
    );
    assert.deepEqual(
        missingNumerals('觀五蘊皆空', 'He saw that the five aggregates are empty'),
        [],
        'the count is present, so nothing is missing'
    );
    assert.deepEqual(
        missingNumerals('度一切苦厄', 'He crossed beyond all suffering'),
        [],
        '一切 means "all", not "one" — counting it would make the metric meaningless'
    );
    assert.deepEqual(
        missingNumerals('一者布施', 'First, giving'),
        [],
        '一者 is an enumerator, not a doctrinal count'
    );
});

test('sourceNumerals requires a following character, so bare ordinals do not inflate the denominator', () => {
    // 分母虚高会让「漏译率」看着变好看，这条钉住分母怎么算
    assert.equal(sourceNumerals('五蘊').length, 1);
    assert.equal(sourceNumerals('第五').length, 0);
    assert.equal(sourceNumerals('一切法').length, 0);
});

test('the stock-phrase detector only judges passages that actually contain the phrase', () => {
    assert.deepEqual(
        missingStock('長夜輪轉生死', 'transmigrating for a very long time'),
        ['长夜'],
        'flattening 長夜 into "a long time" is the loss rule 2 names by example'
    );
    assert.deepEqual(
        missingStock('長夜輪轉生死', 'transmigrating through the long night of birth and death'),
        [],
        'the imagery survived'
    );
    assert.deepEqual(
        missingStock('觀五蘊皆空', 'He saw that the five aggregates are empty'),
        [],
        'a passage without the stock phrase must not count against either arm'
    );
});

test('compound numerals are read whole, not split into digits that can never match', () => {
    // 「十八不共法」译成 eighteen 是对的。第一版把它拆成 十 + 八，
    // 再拿 ten / eight 去找，两个都找不到 —— 一处正确翻译被记成两处漏译。
    assert.deepEqual(
        missingNumerals('十八不共法', 'the eighteen exclusive qualities of a Buddha'),
        [],
        'eighteen renders 十八 correctly and must not be reported as missing'
    );
    assert.deepEqual(
        missingNumerals('十八不共法', 'the exclusive qualities of a Buddha'),
        ['十八'],
        'when the count really is dropped, it must still be caught'
    );
    assert.deepEqual(
        missingNumerals('三十七道品', 'the thirty-seven factors of awakening'),
        []
    );
    assert.equal(sourceNumerals('十八不共法').length, 1, '十八 is one count, not two');
});

test('numerals inside transliterations are not counts', () => {
    // 三藐三菩提 = samyak-saṃbodhi。般若系段落几乎每段都有，
    // 不挡的话两臂各被记一堆假漏译，真实差异会被噪声淹掉。
    assert.deepEqual(
        missingNumerals('阿耨多羅三藐三菩提', 'unexcelled perfect awakening'),
        [],
        '三藐三菩提 is a transcription; there is no "three" to translate'
    );
    assert.equal(sourceNumerals('三昧').length, 0, '三昧 = samādhi');
    assert.equal(sourceNumerals('三摩地').length, 0, '三摩地 = samādhi');
    assert.equal(sourceNumerals('五蘊').length, 1, 'a real count must survive the stoplist');
});

test('三佛陀 is samyak-saṃbuddha, not a count of three', () => {
    // 雜阿含 #12 就栽在这里：三藐三佛陀 的后半截「三佛陀」躲过了 三藐 那条，
    // 两臂各被记一处假漏译。真实数据里挑出来的，不是想出来的。
    assert.deepEqual(missingNumerals('如無量恒河沙三藐三佛陀', 'innumerable perfectly awakened ones'), []);
});
