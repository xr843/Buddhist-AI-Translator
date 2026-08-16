import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const {
    buildLexiconContext,
    findLexiconTerms,
    formatLexiconEntry,
    getLoadedLexicon,
    loadLexicon,
    resetLexicon,
    setLexicon
} = await import('../src/lexicon.js');

const fixture = {
    meta: { license: 'CC BY 4.0' },
    entries: {
        阿賴耶識: { n: 430, sa: [['ālayavijñāna', 45]], bo: [["kun gzhi rnam par shes pa", 135]], src: ['T1579'] },
        識: { n: 3000, sa: [['vijñāna', 900]], src: ['T1558'] },
        涅槃: { n: 3486, sa: [['nirvāṇa', 611], ['parinirvāṇa', 40]], bo: [["mya ngan las 'das pa", 797]], src: ['T0374'] },
        // 「空」与「空性」同起点，是检验最长优先的关键一对：
        // 只有真的从长到短试，才会报「空性」而不是「空」。
        空: { n: 5059, sa: [['śūnyatā', 644]], src: ['T0220'] },
        空性: { n: 810, sa: [['śūnyatā', 512]], src: ['T1579'] },
        // 只有藏译、没有梵文原语的词条不该进 context
        八正道: { n: 54, bo: [["'phags pa'i lam brgyad", 6]], src: ['T0026'] },
        /*
         * 「二無」是挖掘出来的碎片（真实数据里 n=71，梵侧只有 6 次），
         * 「無我」是真词项（n=1523）。在「二無我」上，纯最长优先会先吃掉「二無」
         * 并跳过「無」，把 nairātmya 换成 dvaya-abhāva 喂给模型。
         */
        二無: { n: 71, sa: [['dvaya-abhāva', 6]], src: ['T1585'] },
        無我: { n: 1523, sa: [['nairātmya', 204], ['anātman', 188]], src: ['T1585'] },
        // 反向对照：跨界的对手更弱时，不该让路
        大乘: { n: 900, sa: [['mahāyāna', 400]], src: ['T1579'] },
        乘法: { n: 12, sa: [['yāna-dharma', 3]], src: ['T1579'] },
        /*
         * 排序用的一对：「是時」极常见却毫无信息量，
         * 「尸羅波羅蜜」少见却正是译者需要的。按 n 排，前者会把后者挤掉。
         */
        是時: { n: 1430, sa: [['tena samayena', 300]], src: ['T0223'] },
        尸羅波羅蜜: { n: 99, sa: [['śīlapāramitā', 60]], src: ['T0223'] }
    }
};

test.beforeEach(() => {
    resetLexicon();
    setLexicon(fixture);
});

test('findLexiconTerms prefers the longest match so compounds are not shredded', () => {
    const found = findLexiconTerms('說阿賴耶識者').map(entry => entry.term);

    assert.ok(found.includes('阿賴耶識'));
    // 「識」是「阿賴耶識」的一部分，不该另外再报一条
    assert.ok(!found.includes('識'), `unexpected sub-term match: ${found.join(', ')}`);
});

test('findLexiconTerms takes the longer term when a shorter one starts at the same character', () => {
    // 「空」与「空性」同起点。逐字匹配也能通过上一条测试，只有这一条能把它照出来。
    const found = findLexiconTerms('觀空性者').map(entry => entry.term);

    assert.deepEqual(found, ['空性']);
});

/*
 * 最长优先单用会把词砍成两半。判据只看重叠形态，不看统计——
 * 真实数据里「二無」的对齐支持率 8.5%，而真术语「阿賴耶識」只有 10.5%，
 * 任何靠统计的阈值都会连真术语一起误伤（2026-08-16 量过 8,610 条的分布）。
 */
test('findLexiconTerms yields when a match cuts through a stronger term', () => {
    // 「二無」[0,2) 与「無我」[1,3) 重叠，且「無我」伸到「二無」右边界之外
    const found = findLexiconTerms('謂二無我所顯').map(entry => entry.term);

    assert.ok(found.includes('無我'), `expected 無我, got: ${found.join(', ')}`);
    assert.ok(!found.includes('二無'), `the fragment should have yielded: ${found.join(', ')}`);
});

test('findLexiconTerms keeps the longer term when the rival is contained, not crossing', () => {
    // 「識」完全落在「阿賴耶識」之内，没有跨界——最长优先在这里是对的，不该让路。
    // 「識」(n=3000) 比「阿賴耶識」(n=430) 强得多，若判据用的是统计而非边界，这条会红。
    const found = findLexiconTerms('說阿賴耶識者').map(entry => entry.term);

    assert.ok(found.includes('阿賴耶識'));
    assert.ok(!found.includes('識'));
});

test('findLexiconTerms holds its ground when the crossing rival is weaker', () => {
    // 「乘法」[1,3) 跨出「大乘」[0,2) 的边界，但它更弱（12 vs 900），不该让路
    const found = findLexiconTerms('說大乘法者').map(entry => entry.term);

    assert.ok(found.includes('大乘'), `expected 大乘 to hold, got: ${found.join(', ')}`);
    assert.ok(!found.includes('乘法'));
});

/*
 * context 只有 12 个名额。按 n 排等于「越常见越优先」，而常见恰恰没信息量：
 * 实测一段《大智度論》里，n 降序把「是時」「佛告」塞进去，把四个波羅蜜挤出来，
 * 译文里那几个梵文括注因此凭空消失。词长是粗糙但有效的信息量代理。
 */
test('findLexiconTerms ranks by informativeness, not raw frequency', () => {
    const found = findLexiconTerms('是時行尸羅波羅蜜').map(entry => entry.term);

    assert.ok(found.includes('尸羅波羅蜜'));
    assert.ok(
        found.indexOf('尸羅波羅蜜') < found.indexOf('是時'),
        `the informative term must outrank the frequent one: ${found.join(', ')}`
    );
});

test('buildLexiconContext drops narrative scaffolding so it cannot occupy a slot', () => {
    const context = buildLexiconContext('是時行尸羅波羅蜜');

    assert.match(context, /尸羅波羅蜜/);
    assert.doesNotMatch(context, /是時/, 'structural phrases carry no doctrinal information');
});

/*
 * 排序契约在 2026-08-16 换过：原来是 n 降序，现在是词长优先、n 作次序。
 * 换的原因见上面那条 informativeness 测试——n 降序会让虚词把术语挤出 context。
 * 这里保留的是「每个词只报一次」这个不变的部分，顺带钉住新的次序。
 */
test('findLexiconTerms reports each distinct term once, longer terms first', () => {
    const found = findLexiconTerms('涅槃者空，空者涅槃，涅槃亦空');

    // 「空」(n=5059) 比「涅槃」(n=3486) 常见，但更短、信息量更低
    assert.deepEqual(found.map(entry => entry.term), ['涅槃', '空']);
    assert.equal(found.filter(entry => entry.term === '涅槃').length, 1, 'no duplicates');
});

test('findLexiconTerms is safe on empty input and a missing index', () => {
    assert.deepEqual(findLexiconTerms(''), []);
    assert.deepEqual(findLexiconTerms(null), []);
    assert.deepEqual(findLexiconTerms('涅槃', null), []);
    assert.deepEqual(findLexiconTerms('涅槃', { entries: null }), []);
});

test('buildLexiconContext only feeds the model multi-character terms that have a Sanskrit original', () => {
    const context = buildLexiconContext('阿賴耶識與涅槃、空、八正道');

    assert.match(context, /阿賴耶識 = ālayavijñāna/);
    assert.match(context, /涅槃 = nirvāṇa \/ parinirvāṇa/);
    // 单字噪声高，只有藏译的词条精确率低，两者都挡在 context 外面
    assert.doesNotMatch(context, /^- 空 /m);
    assert.doesNotMatch(context, /八正道/);
});

test('buildLexiconContext caps how much it injects', () => {
    const crowded = {
        meta: {},
        entries: Object.fromEntries(
            Array.from({ length: 40 }, (unused, index) => [
                `術語${String(index).padStart(2, '0')}`,
                { n: 100 - index, sa: [[`lemma${index}`, 50]] }
            ])
        )
    };
    setLexicon(crowded);

    const text = Object.keys(crowded.entries).join('，');
    const lines = buildLexiconContext(text, undefined, { maxTerms: 5 }).split('\n');

    assert.equal(lines.length - 1, 5);
});

test('buildLexiconContext returns an empty string when nothing matches', () => {
    assert.equal(buildLexiconContext('hello world'), '');
});

test('formatLexiconEntry shows the Sanskrit original and the Tibetan rendering', () => {
    const line = formatLexiconEntry({ term: '涅槃', ...fixture.entries['涅槃'] });

    assert.match(line, /^涅槃：/);
    assert.match(line, /梵 nirvāṇa \/ parinirvāṇa/);
    assert.match(line, /藏 mya ngan las 'das pa/);
});

test('loadLexicon fetches once and caches the result', async () => {
    resetLexicon();
    let calls = 0;
    const fetchImpl = async (url) => {
        calls += 1;
        assert.equal(url, './src/data/lexicon.json');
        return { ok: true, status: 200, async json() { return fixture; } };
    };

    const first = await loadLexicon(fetchImpl);
    const second = await loadLexicon(fetchImpl);

    assert.equal(calls, 1);
    assert.equal(first, second);
    assert.equal(getLoadedLexicon(), first);
});

test('loadLexicon lets a failure retry instead of caching the rejection', async () => {
    resetLexicon();
    let calls = 0;
    const failing = async () => {
        calls += 1;
        return { ok: false, status: 500, async json() { return {}; } };
    };

    await assert.rejects(loadLexicon(failing), /术语索引加载失败: 500/);
    await assert.rejects(loadLexicon(failing), /术语索引加载失败: 500/);
    assert.equal(calls, 2);
});

test('the shipped lexicon carries its licence, provenance and sampled precision', async () => {
    const raw = await readFile(new URL('../src/data/lexicon.json', import.meta.url), 'utf8');
    const data = JSON.parse(raw);

    assert.equal(data.meta.license, 'CC BY 4.0');
    assert.match(data.meta.upstream, /github\.com\/dharmamitra\/dharmamitra-lexicon/);
    assert.match(data.meta.upstreamCommit, /^[0-9a-f]{40}$/);
    assert.ok(data.meta.attribution.includes('Dharmamitra'));
    // 精确率是抽样人工核对出来的，必须随数据一起留痕
    assert.ok(data.meta.sampledPrecision.sample >= 30);
    assert.ok(data.meta.sampledPrecision.wrong >= 0);
    assert.ok(data.meta.entries > 1000);
    assert.equal(Object.keys(data.entries).length, data.meta.entries);
});

test('the shipped lexicon keeps the filter that raised precision', async () => {
    const raw = await readFile(new URL('../src/data/lexicon.json', import.meta.url), 'utf8');
    const data = JSON.parse(raw);

    // 「必须有梵文原语」这条把精确率从约 44% 抬到约 88%，退掉它等于退回噪声版本
    assert.equal(data.meta.filters.requireSanskrit, true);
    for (const [term, entry] of Object.entries(data.entries)) {
        assert.ok(Array.isArray(entry.sa) && entry.sa.length > 0, `${term} has no Sanskrit original`);
    }
});

test('the shipped lexicon resolves well-known doctrinal terms to their attested originals', async () => {
    const raw = await readFile(new URL('../src/data/lexicon.json', import.meta.url), 'utf8');
    const data = JSON.parse(raw);
    setLexicon(data);

    const expected = {
        涅槃: 'nirvāṇa',
        菩薩: 'bodhisattva',
        如來: 'tathāgata',
        阿賴耶識: 'ālayavijñāna',
        善知識: 'kalyāṇa-mitra',
        緣起: 'pratītyasamutpāda'
    };

    for (const [term, lemma] of Object.entries(expected)) {
        const entry = data.entries[term];
        assert.ok(entry, `${term} missing from the lexicon`);
        assert.equal(entry.sa[0][0], lemma, `${term} should resolve to ${lemma}`);
    }
});
