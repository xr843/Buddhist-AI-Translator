import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * 不是许可名的短语。写进 License 一栏就等于什么也没说 ——
 * 它不回答署名、商用、衍生里的任何一项，却让人以为查过了。
 */
const FAKE_LICENSE_PHRASES = [
    'academic open access',
    'open access',
    'free to use',
    'freely available',
    'public data',
    '免费使用',
    '开放获取',
    '可自由使用'
];

test('NOTICE lists every redistributed data source with a checkable licence provenance', async () => {
    const notice = await read('NOTICE.md');

    assert.match(notice, /dharmamitra-lexicon/);
    // 许可要给全文链接，不能只写标签
    assert.match(notice, /creativecommons\.org\/licenses\/by\/4\.0/);
    // 声明出处必须可复核：上游没有 LICENSE 文件这件事本身就得记下来
    assert.match(notice, /README/);
    assert.match(notice, /没有\W*`?LICENSE`?\W*文件/);
    // 固定上游版本，否则「我们用的是哪一版」无从查起
    assert.match(notice, /2b327f3453fb1d273ed00f367aac1c83a5c962b1/);
});

test('NOTICE keeps obligations and requests apart', async () => {
    const notice = await read('NOTICE.md');

    // 施压的一方不一定是你欠着的那一方；把请求当义务，会让人以为不办就是违规。
    // 这里要断言的是那句**把两者划开的话**本身还在，光有「义务」「请求」两个词不算。
    assert.match(notice, /dharmamitra-project@gmail\.com/);
    assert.match(
        notice,
        /是请求[，,]\s*不是许可条件/,
        'the sentence that separates the e-mail request from the licence conditions must survive'
    );
    assert.match(notice, /\*\*义务\*\*（[^）]*许可条件/, 'obligations must be labelled as licence conditions');
    assert.match(notice, /\*\*请求\*\*（[^）]*不是合规/, 'requests must be labelled as non-compliance matters');
});

test('NOTICE scopes its negative claims instead of asserting absence', async () => {
    const notice = await read('NOTICE.md');

    // 查了八个路径 ≠ 全世界都没有
    assert.match(notice, /不等于对方确认不存在|非对方确认不存在/);
});

test('NOTICE records that the redistributed data is modified, as CC BY 4.0 requires', async () => {
    const notice = await read('NOTICE.md');

    // CC BY 4.0 §3(a)(1)(B)：改编必须指明
    assert.match(notice, /改编|修改/);
    assert.match(notice, /3\(a\)\(1\)\(B\)/);
});

test('no pseudo-licence phrase is used where an actual licence belongs', async () => {
    const sources = await Promise.all(
        ['NOTICE.md', 'README.md', 'docs/lexicon.md'].map(read)
    );

    for (const [index, source] of sources.entries()) {
        for (const phrase of FAKE_LICENSE_PHRASES) {
            // 只在「许可/licence」同一行里出现才算问题，正文里提到「开放获取」不算
            const offending = source.split('\n').filter(line => (
                new RegExp(phrase, 'i').test(line) && /许可|licen[cs]e/i.test(line)
            ));
            assert.deepEqual(
                offending,
                [],
                `file ${index} states "${phrase}" as a licence: ${offending[0]}`
            );
        }
    }
});

test('the shipped lexicon carries a licence URI, its provenance and the modified flag', async () => {
    const data = JSON.parse(await read('src/data/lexicon.json'));
    const meta = data.meta;

    assert.equal(meta.license, 'CC BY 4.0');
    assert.match(meta.licenseUrl, /^https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/?$/);
    assert.match(meta.licenseSource, /README/);
    assert.equal(meta.modified, true, 'a filtered, aggregated derivative must declare itself modified');
    assert.match(meta.modifications, /filter|aggregat/i);
});

test('the user-visible footer carries attribution, the licence link and the modification notice', async () => {
    const html = await read('index.html');
    const footer = html.slice(html.indexOf('footer-credit'), html.indexOf('</footer>'));

    // 文档里署名不算数 —— 要打开页面看得见
    assert.match(footer, /Dharmamitra/);
    assert.match(footer, /dharmamitra-lexicon/);
    assert.match(footer, /creativecommons\.org\/licenses\/by\/4\.0/);
    assert.match(footer, /改编/, 'CC BY 4.0 requires indicating that the material was modified');
    assert.match(footer, /NOTICE/);
});

test('the CC BY-SA corpus stays out of the repository', async () => {
    // mitra-parallel 是 CC BY-SA 4.0，相同方式共享会传染到本项目的分发条件。
    // 一旦哪天引入，这条会红，提醒重新评估而不是悄悄带进来。
    const sources = await Promise.all(
        ['README.md', 'NOTICE.md', 'package.json', 'scripts/build-lexicon.mjs'].map(read)
    );

    for (const source of sources) {
        const lines = source.split('\n').filter(line => /mitra-parallel/.test(line));
        for (const line of lines) {
            assert.match(
                line,
                /未使用|not used/i,
                `mitra-parallel (CC BY-SA) referenced without stating it is unused: ${line}`
            );
        }
    }
});
