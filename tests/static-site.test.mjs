import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectLocalAssetReferences(html) {
    const references = new Set();
    const attributePattern = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let match;

    while ((match = attributePattern.exec(html)) !== null) {
        const rawReference = match[1] ?? match[2] ?? match[3] ?? '';
        const localReference = normalizeLocalReference(rawReference);

        if (localReference !== null) {
            references.add(localReference);
        }
    }

    return [...references].sort();
}

function normalizeLocalReference(rawReference) {
    const trimmed = rawReference.trim();

    if (
        trimmed === '' ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('//') ||
        /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ) {
        return null;
    }

    const withoutFragment = trimmed.split('#', 1)[0];
    const withoutQuery = withoutFragment.split('?', 1)[0];
    const normalizedPath = withoutQuery.replace(/^\/+/, '');

    return normalizedPath === '' ? null : normalizedPath;
}

async function findMissingLocalAssetReferences(html, rootDir) {
    const missing = [];

    for (const reference of collectLocalAssetReferences(html)) {
        const assetPath = path.join(rootDir, reference);

        try {
            const assetStat = await stat(assetPath);
            if (!assetStat.isFile()) {
                missing.push(reference);
            }
        } catch {
            missing.push(reference);
        }
    }

    return missing;
}

test('index.html references existing local assets and modules', async () => {
    const indexPath = path.join(repoRoot, 'index.html');
    const html = await readFile(indexPath, 'utf8');
    const references = collectLocalAssetReferences(html);

    // 三层样式表的引用顺序就是层叠顺序：token 先于基元，基元先于组件。
    const stylesheets = ['styles/tokens.css', 'styles/base.css', 'styles/components.css'];

    for (const stylesheet of stylesheets) {
        assert.ok(references.includes(stylesheet), `expected index.html to reference ${stylesheet}`);
    }

    const linkOrder = stylesheets.map(stylesheet => html.indexOf(stylesheet));
    assert.deepEqual(
        linkOrder,
        [...linkOrder].sort((a, b) => a - b),
        'stylesheets must be linked in cascade order: tokens, base, components'
    );

    assert.ok(references.includes('src/main.js'), 'expected index.html to reference src/main.js');
    assert.deepEqual(await findMissingLocalAssetReferences(html, repoRoot), []);
});

test('local asset check reports missing files while ignoring external URLs and anchors', async (t) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'static-site-assets-'));
    t.after(() => rm(tempRoot, { recursive: true, force: true }));
    await mkdir(path.join(tempRoot, 'src'));
    await writeFile(path.join(tempRoot, 'styles.css'), '');

    const html = `
        <link rel="stylesheet" href="styles.css?v=1">
        <script type="module" src="src/missing.js"></script>
        <a href="#settings">Settings</a>
        <a href="https://example.com/docs">Docs</a>
        <img src="data:image/png;base64,AAAA" alt="">
    `;

    assert.deepEqual(await findMissingLocalAssetReferences(html, tempRoot), ['src/missing.js']);
});

test('project structure does not keep the legacy bundled script', async () => {
    const readme = await readFile(path.join(repoRoot, 'README.md'), 'utf8');

    assert.doesNotMatch(readme, /script\.js/);
    await assert.rejects(
        stat(path.join(repoRoot, 'script.js')),
        { code: 'ENOENT' }
    );
});

/*
 * 站点地址露在五处：index.html 的 canonical / og:url / twitter:url / JSON-LD，
 * 以及 README 的三个链接。
 *
 * 这条测试**不写死具体域名**，而是以 canonical 为唯一真源，比对其余各处是否跟上。
 * 上一版把域名硬编码了四遍，换域名时连测试一起改——那样测试是负担不是护栏。
 *
 * 将来若绑自定义域名（GitHub Pages 靠仓库根的 CNAME 文件认），
 * 只需改 canonical 与新增 CNAME，其余各处由这条测试保证不掉队。
 */
test('every place that states the site URL agrees with the canonical link', async () => {
    const [html, readme] = await Promise.all([
        readFile(path.join(repoRoot, 'index.html'), 'utf8'),
        readFile(path.join(repoRoot, 'README.md'), 'utf8')
    ]);

    const siteUrl = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
    assert.ok(siteUrl, 'index.html must declare a canonical URL');
    assert.match(siteUrl, /^https:\/\/[^\s"]+\/$/, 'the canonical URL should be absolute and end in a slash');

    assert.equal(html.match(/<meta property="og:url" content="([^"]+)">/)?.[1], siteUrl);
    assert.equal(html.match(/<meta name="twitter:url" content="([^"]+)">/)?.[1], siteUrl);
    assert.ok(html.includes(`"url": "${siteUrl}"`), 'the JSON-LD url must match too');

    const escaped = siteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const pattern of [
        new RegExp(`\\[!\\[Live Demo\\]\\([^)]+\\)\\]\\(${escaped}\\)`),
        new RegExp(`在线使用\\*\\*: \\[${escaped}\\]`),
        new RegExp(`Online Demo\\*\\*: \\[${escaped}\\]`)
    ]) {
        assert.match(readme, pattern);
    }

    // 绑了自定义域名就必须有 CNAME 文件，否则 GitHub Pages 认不出来，站点会 404
    const host = new URL(siteUrl).hostname;
    if (!host.endsWith('.github.io')) {
        const cname = await readFile(path.join(repoRoot, 'CNAME'), 'utf8').catch(() => null);
        assert.equal(cname?.trim(), host, 'a custom canonical host needs a matching CNAME file');
    }
});

/*
 * JSON-LD 被 CSP 的 script-src sha256 覆盖着。改动 URL 时若不重算哈希，
 * 整页脚本会被 CSP 拦死——而这在本地静态服务器上不一定复现，很容易漏。
 */
test('the CSP hash matches the JSON-LD block it covers', async () => {
    const html = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
    const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const declared = html.match(/'(sha256-[A-Za-z0-9+/=]+)'/)?.[1];

    assert.ok(block, 'expected a JSON-LD block');
    assert.ok(declared, 'expected a script-src hash in the CSP');

    const actual = 'sha256-' + createHash('sha256').update(block, 'utf8').digest('base64');
    assert.equal(actual, declared, 'recompute the CSP hash after editing the JSON-LD block');
});

test('verification includes a real browser smoke check in CI', async () => {
    const [packageJson, workflow] = await Promise.all([
        readFile(path.join(repoRoot, 'package.json'), 'utf8'),
        readFile(path.join(repoRoot, '.github/workflows/verify.yml'), 'utf8')
    ]);
    const pkg = JSON.parse(packageJson);

    assert.equal(pkg.scripts['check:smoke'], 'node scripts/smoke-static-site.mjs');
    assert.match(pkg.scripts.verify, /npm run check:smoke/);
    assert.ok(pkg.devDependencies?.['@playwright/test'], 'expected @playwright/test dev dependency');
    assert.match(workflow, /npm ci/);
    assert.match(workflow, /npx playwright install --with-deps chromium/);
});

test('local verification docs include dependency and browser setup', async () => {
    const [readme, contributing] = await Promise.all([
        readFile(path.join(repoRoot, 'README.md'), 'utf8'),
        readFile(path.join(repoRoot, 'CONTRIBUTING.md'), 'utf8')
    ]);

    for (const source of [readme, contributing]) {
        assert.match(source, /npm install|npm ci/);
        assert.match(source, /npx playwright install chromium|npx playwright install --with-deps chromium/);
        assert.match(source, /npm run verify/);
    }
});

test('README documents translation result export', async () => {
    const readme = await readFile(path.join(repoRoot, 'README.md'), 'utf8');

    assert.match(readme, /导出|下载译文/);
    assert.match(readme, /export|download/i);
});

/*
 * 页脚年份不许再写死。
 *
 * 2026-08-17 用户截图指出页脚还写着「© 2025」——没有任何测试发现它，
 * 因为没有任何测试盯着它。硬编码的年份每年一月都会自己变成错的，
 * 而它出现在每一页的最底部，是最容易被当成「站点没人管了」的信号。
 *
 * 现在的写法：HTML 里只写起始年当兜底，当前年由 src/main.js 用
 * utils.copyrightYears 接上。这条钉住这个结构，不是钉某个具体年份
 * ——钉年份的测试自己也会过期。
 */
test('the footer copyright year is rendered, not hardcoded', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));

    assert.match(
        footer,
        /id="copyright-years"/,
        'the footer needs a hook for the rendered year, otherwise it goes stale every January'
    );
    // 兜底值必须是起始年，不能是「今年」——否则 JS 挂掉时又变成一个会过期的死年份
    assert.match(footer, /id="copyright-years">\s*2025\s*</);

    assert.match(main, /copyrightYears\(/, 'main.js must render the year range');
    assert.match(main, /new Date\(\)\.getFullYear\(\)/, 'the current year must come from the clock');
});

/*
 * 页脚只许写页面上真做得到的事。
 *
 * 页脚曾经写「佛典翻译与**语料检索**由 Dharmamitra / MITRA 提供」，
 * 但藏经溯源面板在 #80 就被移除了，界面上没有任何检索入口。
 * src/mitra.js 的客户端和 Worker 的 /mitra/search 路由都还在，
 * 所以代码搜索会让人以为功能健在——**用户点不到就是没有**。
 *
 * 这条是条件闸门：页脚可以提检索，前提是界面上真有入口。
 * 哪天溯源功能做回来，这条自然放行；在那之前它挡着空头承诺。
 */
test('the footer does not advertise a corpus-search feature the UI has no entry point for', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    const body = html.slice(0, html.indexOf('<footer'));

    const footerClaimsSearch = /语料检索|藏经检索|出处溯源|溯源/.test(footer.replace(/<!--[\s\S]*?-->/g, ''));
    const uiHasSearchEntry = /id="provenance-btn"|id="provenance-panel"|data-action="provenance"/.test(body);

    if (footerClaimsSearch && !uiHasSearchEntry) {
        assert.fail(
            'the footer advertises corpus search, but index.html has no provenance entry point — '
            + 'either restore the UI or drop the claim'
        );
    }
});
