import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.localStorage = {
    getItem() {
        return '';
    }
};

const { languageMap } = await import('../src/config.js');

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const compact = (source) => source.replace(/\s+/g, '');

function selectOptions(html, selectId) {
    const selectMatch = html.match(new RegExp(`<select[^>]+id="${selectId}"[^>]*>([\\s\\S]*?)<\\/select>`));
    assert.ok(selectMatch, `missing #${selectId} select`);

    return [...selectMatch[1].matchAll(/<option\s+value="([^"]+)"[^>]*>([^<]+)<\/option>/g)]
        .map(([, value, label]) => ({ value, label: label.trim() }));
}

function anchorTags(html) {
    return [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
}

function attributes(tag) {
    return Object.fromEntries(
        [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)]
            .map(([, name, value]) => [name.toLowerCase(), value])
    );
}

function contentSecurityPolicy(html) {
    const metaTags = [...html.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => attributes(tag));
    const cspMeta = metaTags.find(attrs => attrs['http-equiv']?.toLowerCase() === 'content-security-policy');

    return cspMeta?.content ?? '';
}

function cspDirectives(policy) {
    return new Map(
        policy.split(';')
            .map(directive => directive.trim().split(/\s+/).filter(Boolean))
            .filter(parts => parts.length > 0)
            .map(([name, ...sources]) => [name, sources])
    );
}

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

test('src/ui.js delegates API key persistence to config helpers', async () => {
    const source = await readSource('src/ui.js');

    assert.match(source, /import\s*{[^}]*storeApiKey[^}]*}\s*from\s*['"]\.\/config\.js['"]/s);
    assert.match(source, /storeApiKey\(apiKey\)/);
    assert.doesNotMatch(source, /localStorage\.setItem\(['"]deepseek_api_key['"]/);
});

test('src/ui.js handles clipboard permission failures', async () => {
    const source = await readSource('src/ui.js');
    const normalized = compact(source);

    assert.match(normalized, /navigator\.clipboard\.writeText\(resultDiv\.textContent\)\.then\(/);
    assert.match(normalized, /showMessage\(['"]复制成功['"],['"]success['"]\)/);
    assert.match(normalized, /writeText\(resultDiv\.textContent\)[\s\S]*\.catch\(/);
    assert.match(source, /复制失败/);
    assert.match(normalized, /navigator\.clipboard\.readText\(\)\.then\(/);
    assert.match(normalized, /sourceTextArea\.value=text/);
    assert.match(normalized, /readText\(\)[\s\S]*\.catch\(/);
    assert.match(source, /无法读取剪贴板/);
});

test('src/ui.js shows classified API translation errors', async () => {
    const source = await readSource('src/ui.js');

    assert.match(source, /import\s*{[^}]*describeTranslationError[^}]*}\s*from\s*['"]\.\/translator\.js['"]/s);
    assert.match(source, /describeTranslationError\(apiError\)/);
    assert.doesNotMatch(source, /showMessage\(['"]API暂时不可用，使用内置翻译['"],\s*['"]warning['"]\)/);
});

test('styles.css keeps the fixed footer from covering translator content', async () => {
    const source = await readSource('styles.css');

    assert.match(source, /body\s*{[^}]*min-height:\s*100vh/s);
    assert.doesNotMatch(source, /body\s*{[^}]*overflow:\s*hidden/s);
    assert.match(source, /\.translator\s*{[^}]*padding-bottom:\s*(?:calc\([^}]+footer|[4-9]\dpx|[1-9]\d{2,}px)/s);
    assert.match(source, /\.translator-card\s*{[^}]*min-height:\s*(?:min\(|clamp\(|calc\()/s);
});

test('index.html language selectors use configured language labels', async () => {
    const source = await readSource('index.html');
    const sourceOptions = selectOptions(source, 'source-lang');
    const targetOptions = selectOptions(source, 'target-lang');

    assert.deepEqual(
        sourceOptions,
        Object.entries(languageMap).map(([value, label]) => ({ value, label }))
    );
    assert.deepEqual(
        targetOptions,
        Object.entries(languageMap)
            .filter(([value]) => !['auto', 'other'].includes(value))
            .map(([value, label]) => ({ value, label }))
    );
});

test('index.html protects links that open new tabs', async () => {
    const source = await readSource('index.html');
    const newTabLinks = anchorTags(source).filter(tag => /target="_blank"/.test(tag));

    assert.ok(newTabLinks.length > 0, 'expected at least one external link that opens a new tab');
    for (const tag of newTabLinks) {
        assert.match(tag, /\brel="[^"]*\bnoopener\b[^"]*"/);
        assert.match(tag, /\brel="[^"]*\bnoreferrer\b[^"]*"/);
    }
});

test('index.html defines a conservative content security policy', async () => {
    const source = await readSource('index.html');
    const policy = contentSecurityPolicy(source);
    const directives = cspDirectives(policy);

    assert.ok(policy, 'missing Content-Security-Policy meta tag');
    assert.ok(directives.get('default-src')?.includes("'self'"), "default-src should include 'self'");
    assert.deepEqual(directives.get('object-src'), ["'none'"]);
    assert.deepEqual(directives.get('base-uri'), ["'self'"]);
    assert.ok(
        directives.get('connect-src')?.includes('https://api.deepseek.com'),
        'connect-src should allow the DeepSeek API'
    );
    assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
});

test('README documents static-server usage and modular project structure', async () => {
    const source = await readSource('README.md');
    const lower = source.toLowerCase();

    assert.doesNotMatch(lower, /open\s+index\.html|打开\s+index\.html|浏览器中打开\s+index\.html/);
    assert.match(lower, /http:\/\/127\.0\.0\.1|python3\s+-m\s+http\.server|static server|静态服务器/);
    assert.match(source, /src\/\s+#/);
    assert.match(source, /worker\/\s+#/);
});

test('worker README documents language-code request fields', async () => {
    const source = await readSource('worker/README.md');

    assert.match(source, /"sourceLang":\s*"pi"/);
    assert.match(source, /"targetLang":\s*"en"/);
    assert.match(source, /语言代码/);
    assert.match(source, /targetLang[^。\n]+不能使用 `auto` 或 `other`/);
});

test('CONTRIBUTING points terminology updates at src/terms.json', async () => {
    const source = await readSource('CONTRIBUTING.md');

    assert.match(source, /src\/terms\.json/);
    assert.match(source, /"基础概念"\s*:\s*{/);
    assert.match(source, /"无常"\s*:\s*"impermanence \/ अनित्य"/);
    assert.doesNotMatch(source, /script\.js\s+的\s+BUDDHIST_TERMS|BUDDHIST_TERMS\s+对象/);
});
