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

/*
 * 2026-08-15 的教训：NOTICE 曾断言 mitra-parallel 是 CC BY-SA 4.0，却没记这条断言
 * 出自哪里。核查时先 grep 了根 README（0 命中）就险些反过来判成「上游没给许可」——
 * 真正的声明在 v1/README.md 的 ## License 一节。
 *
 * 无法复核的许可断言，和写错的许可断言一样危险：它让下一个人无从判断该信不该信。
 * 所以每条声明要么带出处，要么老实标 UNVERIFIED。
 */
test('every licence claim in NOTICE carries a checkable source or is marked UNVERIFIED', async () => {
    const notice = await read('NOTICE.md');
    const sections = notice.split(/\n(?=[-*] `|## )/);
    // 只查「对第三方数据的许可断言」：既点名了上游资源，又给它安了一个许可名。
    // 本项目自己的 MIT、以及只是顺带提到许可名的服务说明，不在此列——
    // 闸门过宽会制造误报，误报多了就没人当真，等于没有闸门。
    const claims = sections.filter(section =>
        /CC BY(-SA)? \d\.\d|CC0 1\.0/.test(section)
        && /`(dharmamitra\/|buddhist-nlp\/|src\/data\/)/.test(section)
    );

    assert.ok(claims.length >= 2, 'expected NOTICE to record at least two upstream licences');

    for (const section of claims) {
        const name = section.slice(0, 60).replace(/\s+/g, ' ').trim();
        const hasSource = /许可声明的出处|声明的出处|LICENSE 文件|## License|README/.test(section);
        const markedUnverified = /UNVERIFIED/.test(section);

        assert.ok(
            hasSource || markedUnverified,
            `licence claim without a checkable source and without an UNVERIFIED marker: ${name}`
        );
    }
});

test('negative licence findings stay scoped to where we actually looked', async () => {
    const notice = await read('NOTICE.md');
    const unverified = notice.split(/\n(?=[-*] `|## )/).filter(s => /UNVERIFIED/.test(s));

    for (const section of unverified) {
        // 「没找到」必须写成「在这些位置没找到」，不能写成「不存在」
        assert.match(
            section,
            /未找到|not found/,
            'an UNVERIFIED finding must say what was not found'
        );
        assert.match(
            section,
            /不是对方确认不存在|非对方确认不存在|not .*confirm/i,
            'an UNVERIFIED finding must state it is not the upstream confirming absence'
        );
    }
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
