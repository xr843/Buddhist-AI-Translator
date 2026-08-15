import test from 'node:test';
import assert from 'node:assert/strict';

const {
    HARD_SENTENCE_LIMIT,
    MAX_CONTEXT_WORDS,
    buildRollingContext,
    chunkDocument,
    renderDocumentMarkdown,
    splitSentences,
    translateDocument
} = await import('../src/document.js');
const { countWords, truncateToWords } = await import('../src/utils.js');

const AMITABHA = `如是我聞。一時佛在舍衛國祇樹給孤獨園。與大比丘僧千二百五十人俱。皆是大阿羅漢，眾所知識。

舍利弗，彼土何故名為極樂？其國眾生，無有眾苦，但受諸樂，故名極樂。
又舍利弗，極樂國土，七重欄楯，七重羅網，七重行樹，皆是四寶周匝圍繞，是故彼國名為極樂。`;

// --- 断句 ---

test('splitSentences keeps the terminator with its sentence', () => {
    const sentences = splitSentences('如是我聞。一時佛在舍衛國。').map(s => s.text);
    assert.deepEqual(sentences, ['如是我聞。', '一時佛在舍衛國。']);
});

test('splitSentences keeps a closing quote attached to the sentence it ends', () => {
    const sentences = splitSentences('佛告舍利弗：「汝且觀之。」爾時世尊而說偈言。').map(s => s.text);

    assert.equal(sentences.length, 2);
    // 收尾的「」不能被甩到下一句去
    assert.ok(sentences[0].endsWith('」'), `got: ${sentences[0]}`);
    assert.equal(sentences[1], '爾時世尊而說偈言。');
});

test('splitSentences falls back to the Tibetan shad when there is no CJK punctuation', () => {
    const sentences = splitSentences("de nas bcom ldan 'das kyis། byang chub sems dpa' la bka' stsal to།")
        .map(s => s.text);

    assert.equal(sentences.length, 2);
    assert.ok(sentences[0].endsWith('།'));
});

test('splitSentences force-splits an unpunctuated block instead of emitting one huge sentence', () => {
    // 无句读的偈颂：切不动就得退让，否则整篇会被当成一句塞进一个块
    const verse = Array.from({ length: 120 }, (unused, i) => `色不異空${i}`).join('，');
    assert.ok(verse.length > HARD_SENTENCE_LIMIT);

    const sentences = splitSentences(verse);

    assert.ok(sentences.length > 1, 'an over-long unpunctuated block must be broken up');
    assert.ok(sentences.every(s => s.forced), 'forced splits must be flagged');
    assert.ok(sentences.every(s => s.text.length <= HARD_SENTENCE_LIMIT + 20));
});

test('splitSentences is safe on empty and non-string input', () => {
    assert.deepEqual(splitSentences(''), []);
    assert.deepEqual(splitSentences('   '), []);
    assert.deepEqual(splitSentences(null), []);
});

// --- 分块 ---

test('chunkDocument never splits a sentence across chunks', () => {
    const chunks = chunkDocument(AMITABHA);
    const rejoined = chunks.flatMap(chunk => chunk.sentences).join('');
    const original = splitSentences(AMITABHA.replace(/\n\s*\n+/g, '')).map(s => s.text).join('');

    // 逐句拼回去要和原文一致（去掉段落空行的影响）
    assert.equal(rejoined.replace(/\s+/g, ''), original.replace(/\s+/g, ''));
    for (const chunk of chunks) {
        for (const sentence of chunk.sentences) {
            assert.ok(sentence.trim().length > 0);
        }
    }
});

test('chunkDocument emits one sentence per line, which is the layout the backend prefers', () => {
    const chunks = chunkDocument(AMITABHA);

    for (const chunk of chunks) {
        assert.equal(chunk.text, chunk.sentences.join('\n'));
        assert.equal(chunk.text.split('\n').length, chunk.sentences.length);
    }
});

test('chunkDocument respects the sentence and character ceilings', () => {
    const many = Array.from({ length: 30 }, (unused, i) => `第${i}句話在此。`).join('');
    const chunks = chunkDocument(many, { maxSentences: 5, maxChars: 1000 });

    assert.ok(chunks.length >= 6);
    for (const chunk of chunks) {
        assert.ok(chunk.sentences.length <= 5, `chunk has ${chunk.sentences.length} sentences`);
    }

    const tight = chunkDocument(many, { maxSentences: 50, maxChars: 20 });
    assert.ok(tight.length > chunks.length, 'a tighter character cap must produce more chunks');
});

test('chunkDocument breaks at paragraph boundaries even when the chunk is not full', () => {
    const chunks = chunkDocument('第一段。\n\n第二段。');

    // 两句都很短，凑一块也放得下，但段落边界优先 —— 偈颂与散文不该粘在一起
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].text, '第一段。');
    assert.equal(chunks[1].text, '第二段。');
});

test('chunkDocument indexes chunks consecutively from zero', () => {
    const chunks = chunkDocument(AMITABHA);
    assert.deepEqual(chunks.map(c => c.index), chunks.map((unused, i) => i));
});

test('chunkDocument returns nothing for empty input', () => {
    assert.deepEqual(chunkDocument(''), []);
    assert.deepEqual(chunkDocument('   \n\n  '), []);
});

// --- 上下文 ---

test('buildRollingContext puts the prior translation first, ahead of the glossary', () => {
    const context = buildRollingContext({
        priorTranslations: ['Thus have I heard.'],
        glossary: '- 涅槃 = nirvāṇa',
        registerReminder: 'Neutral contemporary register.'
    });

    const priorAt = context.indexOf('Thus have I heard.');
    const glossaryAt = context.indexOf('涅槃');
    assert.ok(priorAt >= 0 && glossaryAt >= 0);
    // 官方文档的理由：一份用了这些术语的上文，本身就隐含了术语表
    assert.ok(priorAt < glossaryAt, 'the rolling translation must outrank the glossary');
});

test('buildRollingContext only carries the most recent chunks forward', () => {
    const context = buildRollingContext({
        priorTranslations: ['块一', '块二', '块三', '块四', '块五'],
        rollingChunks: 2
    });

    assert.ok(context.includes('块四'));
    assert.ok(context.includes('块五'));
    assert.ok(!context.includes('块三'), 'older chunks beyond the window must be dropped');
});

test('buildRollingContext drops from the bottom, taking everything below with it', () => {
    // 预算算过：滚动上文吃掉 87 词，术语表装得下，专名装不下 ——
    // 此时语体提醒虽然很便宜，也不能挤进来，否则就不是「从底下丢」了
    const context = buildRollingContext({
        priorTranslations: ['prior '.repeat(80)],
        glossary: 'GLOSSARY-MARKER',
        namedEntities: 'A-VERY-LONG-ENTITY-SECTION '.repeat(10),
        registerReminder: 'REGISTER-MARKER',
        maxWords: 100
    });

    assert.ok(context.includes('prior'), 'the rolling translation must survive');
    assert.ok(context.includes('GLOSSARY-MARKER'), 'the glossary still fits and must be kept');
    assert.ok(!context.includes('A-VERY-LONG-ENTITY-SECTION'), 'the section that overflows must be dropped');
    assert.ok(
        !context.includes('REGISTER-MARKER'),
        'a cheap low-priority section must not slip in past a dropped higher-priority one'
    );
    assert.ok(countWords(context) <= 100, `context was ${countWords(context)} words`);
});

test('buildRollingContext does not let an absent section block the ones below it', () => {
    // 没给参考译本 ≠ 参考译本被丢掉，后面的术语表照样要装
    const context = buildRollingContext({
        priorTranslations: ['prior'],
        referenceTranslation: '',
        glossary: 'GLOSSARY-MARKER'
    });

    assert.ok(context.includes('GLOSSARY-MARKER'));
});

test('buildRollingContext truncates rather than discards an over-long prior translation', () => {
    // 连一块都装不下时，宁可截断保留末尾，也不能整节丢掉 ——
    // 丢了它这个功能就退化成逐段各译各的
    const context = buildRollingContext({
        priorTranslations: ['开头一行\n' + '中间行\n'.repeat(400) + '最后一行'],
        maxWords: 60
    });

    assert.ok(context.includes('最后一行'), 'the tail is the part nearest the current chunk');
    assert.ok(!context.includes('开头一行'));
    assert.ok(countWords(context) <= 80, `context was ${countWords(context)} words`);
});

test('buildRollingContext returns an empty string when there is nothing to say', () => {
    assert.equal(buildRollingContext({}), '');
    assert.equal(buildRollingContext({ priorTranslations: ['', '   '] }), '');
});

test('the default context budget matches the documented ~400 words', () => {
    assert.equal(MAX_CONTEXT_WORDS, 400);
});

// --- 驱动器 ---

async function drain(iterator) {
    const events = [];
    for await (const event of iterator) events.push(event);
    return events;
}

test('translateDocument feeds each chunk the translation of the one before it', async () => {
    const seen = [];
    const events = await drain(translateDocument(
        { text: AMITABHA },
        async ({ chunk, context }) => {
            seen.push({ index: chunk.index, context });
            return { text: `TRANSLATION-${chunk.index}` };
        }
    ));

    assert.ok(seen.length >= 2);
    // 第一块没有上文
    assert.equal(seen[0].context, '');
    // 这是整个功能的命门：后一块必须看得见前一块的译文
    for (let i = 1; i < seen.length; i += 1) {
        assert.ok(
            seen[i].context.includes(`TRANSLATION-${i - 1}`),
            `chunk ${i} did not receive chunk ${i - 1}'s translation`
        );
    }

    assert.equal(events[0].type, 'start');
    assert.equal(events.at(-1).type, 'done');
    assert.equal(events.filter(e => e.type === 'chunk').length, seen.length);
});

test('translateDocument passes the per-chunk glossary through glossaryFor', async () => {
    const asked = [];
    await drain(translateDocument(
        {
            text: '涅槃者寂滅。\n\n菩薩行深般若。',
            glossaryFor(text) {
                asked.push(text);
                return text.includes('涅槃') ? '- 涅槃 = nirvāṇa' : '- 菩薩 = bodhisattva';
            }
        },
        async ({ context, chunk }) => {
            if (chunk.index === 0) assert.ok(context.includes('nirvāṇa'));
            if (chunk.index === 1) assert.ok(context.includes('bodhisattva'));
            return { text: `T${chunk.index}` };
        }
    ));

    assert.equal(asked.length, 2);
});

test('translateDocument stops at the first failure and reports which chunk broke', async () => {
    const events = await drain(translateDocument(
        { text: AMITABHA },
        async ({ chunk }) => {
            if (chunk.index === 1) throw new Error('upstream 503');
            return { text: `T${chunk.index}` };
        }
    ));

    const failure = events.find(e => e.type === 'error');
    assert.ok(failure, 'a failure must be reported, not swallowed');
    assert.equal(failure.index, 1);
    assert.match(failure.error.message, /upstream 503/);
    // 出错后不能继续往下译，否则后面全建立在缺失的上文上
    assert.equal(events.filter(e => e.type === 'chunk').length, 1);
    assert.equal(events.some(e => e.type === 'done'), false);
});

test('translateDocument treats a blank translation as a failure', async () => {
    const events = await drain(translateDocument(
        { text: '如是我聞。' },
        async () => ({ text: '   ' })
    ));

    assert.equal(events.some(e => e.type === 'error'), true);
    assert.equal(events.some(e => e.type === 'done'), false);
});

test('translateDocument can be abandoned part-way without running the rest', async () => {
    let calls = 0;
    const iterator = translateDocument({ text: AMITABHA }, async ({ chunk }) => {
        calls += 1;
        return { text: `T${chunk.index}` };
    });

    await iterator.next();          // start
    await iterator.next();          // 第一块
    await iterator.return();        // 中途放弃

    assert.equal(calls, 1, 'abandoning the iterator must not keep translating');
});

// --- 导出 ---

test('renderDocumentMarkdown pairs every chunk with its translation', () => {
    const entries = chunkDocument(AMITABHA).map(chunk => ({ chunk, translation: `T${chunk.index}` }));
    const markdown = renderDocumentMarkdown(entries, { title: '佛說阿彌陀經', engine: 'MITRA' });

    assert.match(markdown, /# 佛說阿彌陀經/);
    assert.match(markdown, /引擎：MITRA/);
    for (const entry of entries) {
        assert.ok(markdown.includes(entry.chunk.text), 'the source of every chunk must be exported');
        assert.ok(markdown.includes(entry.translation));
    }
});

// --- 词数工具 ---

test('countWords counts CJK by character and the rest by whitespace', () => {
    assert.equal(countWords('如是我聞'), 4);
    assert.equal(countWords('thus have I heard'), 4);
    assert.equal(countWords('如是我聞 thus have I heard'), 8);
    assert.equal(countWords(''), 0);
    assert.equal(countWords(null), 0);
});

test('countWords does not treat a whole Tibetan clause as a single word', () => {
    const tibetan = "བྱང་ཆུབ་སེམས་དཔའ";
    assert.ok(countWords(tibetan) > 1, 'tsheg-separated syllables must not collapse to one word');
});

test('truncateToWords keeps the tail because that is what sits next to the current chunk', () => {
    const text = 'line one\nline two\nline three\nline four';
    const trimmed = truncateToWords(text, 4);

    assert.ok(trimmed.includes('line four'));
    assert.ok(!trimmed.includes('line one'));
    assert.equal(truncateToWords(text, 0), '');
    assert.equal(truncateToWords('short', 100), 'short');
});
