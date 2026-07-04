import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const compact = (source) => source.replace(/\s+/g, '');

test('src/ui.js registers documented Ctrl keyboard shortcuts', async () => {
    const source = await readSource('src/ui.js');
    const normalized = compact(source);

    assert.match(source, /document\.addEventListener\(\s*['"]keydown['"]/);
    assert.match(normalized, /(?:event|e)\.preventDefault\(\)/);
    assert.match(normalized, /(?:event|e)\.ctrlKey/);
    assert.match(normalized, /(?:event|e)\.shiftKey/);
    assert.match(normalized, /(?:event|e)\.key===['"]Enter['"][^}]+handleTranslate\(\)/);
    assert.match(normalized, /(?:event|e)\.key\.toLowerCase\(\)===['"]c['"][^}]+copyResult\(\)/);
    assert.match(normalized, /(?:event|e)\.key\.toLowerCase\(\)===['"]v['"][^}]+pasteText\(\)/);
    assert.match(normalized, /(?:event|e)\.key\.toLowerCase\(\)===['"]x['"][^}]+clearInput\(\)/);
});

test('styles.css keeps the fixed footer from covering translator content', async () => {
    const source = await readSource('styles.css');

    assert.match(source, /body\s*{[^}]*min-height:\s*100vh/s);
    assert.doesNotMatch(source, /body\s*{[^}]*overflow:\s*hidden/s);
    assert.match(source, /\.translator\s*{[^}]*padding-bottom:\s*(?:calc\([^}]+footer|[4-9]\dpx|[1-9]\d{2,}px)/s);
    assert.match(source, /\.translator-card\s*{[^}]*min-height:\s*(?:min\(|clamp\(|calc\()/s);
});

test('README documents static-server usage and modular project structure', async () => {
    const source = await readSource('README.md');
    const lower = source.toLowerCase();

    assert.doesNotMatch(lower, /open\s+index\.html|打开\s+index\.html|浏览器中打开\s+index\.html/);
    assert.match(lower, /http:\/\/127\.0\.0\.1|python3\s+-m\s+http\.server|static server|静态服务器/);
    assert.match(source, /src\/\s+#/);
    assert.match(source, /worker\/\s+#/);
});

test('CONTRIBUTING points terminology updates at src/terms.json', async () => {
    const source = await readSource('CONTRIBUTING.md');

    assert.match(source, /src\/terms\.json/);
    assert.match(source, /"基础概念"\s*:\s*{/);
    assert.match(source, /"无常"\s*:\s*"impermanence \/ अनित्य"/);
    assert.doesNotMatch(source, /script\.js\s+的\s+BUDDHIST_TERMS|BUDDHIST_TERMS\s+对象/);
});
