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
        八正道: { n: 54, bo: [["'phags pa'i lam brgyad", 6]], src: ['T0026'] }
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

test('findLexiconTerms reports each distinct term once, ordered by attestation count', () => {
    const found = findLexiconTerms('涅槃者空，空者涅槃，涅槃亦空');

    assert.deepEqual(found.map(entry => entry.term), ['空', '涅槃']);
    assert.equal(found[0].n, 5059);
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
