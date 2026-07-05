import assert from 'node:assert/strict';
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

    assert.ok(references.includes('styles.css'), 'expected index.html to reference styles.css');
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

test('README live demo links match the canonical site URL', async () => {
    const [html, readme] = await Promise.all([
        readFile(path.join(repoRoot, 'index.html'), 'utf8'),
        readFile(path.join(repoRoot, 'README.md'), 'utf8')
    ]);
    const canonicalUrl = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];

    assert.equal(canonicalUrl, 'https://xr843.github.io/Buddhist-AI-Translator/');
    assert.match(readme, /\[!\[Live Demo\]\([^)]+\)\]\(https:\/\/xr843\.github\.io\/Buddhist-AI-Translator\/\)/);
    assert.match(readme, /在线使用\*\*: \[https:\/\/xr843\.github\.io\/Buddhist-AI-Translator\/\]/);
    assert.match(readme, /Online Demo\*\*: \[https:\/\/xr843\.github\.io\/Buddhist-AI-Translator\/\]/);
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
