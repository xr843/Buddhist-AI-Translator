import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TOKENS = 'styles/tokens.css';
// tokens.css 是唯一允许写裸 hex 的文件——token 定义本身就得写 hex。
// 拆分样式表的全部理由就是让下面这道门禁能被表达出来。
const CONSUMERS = ['styles/base.css', 'styles/components.css'];

function read(relativePath) {
    return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 取出一个块的内容。从 openerIndex 处的 `{` 开始做花括号配对，
 * 不能用非贪婪正则——@media 里嵌着 :root，正则会在第一个 `}` 就断掉。
 */
function blockAt(css, openerIndex) {
    const start = css.indexOf('{', openerIndex);
    assert.notEqual(start, -1, 'expected a block opener');

    let depth = 0;

    for (let i = start; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') {
            depth -= 1;
            if (depth === 0) return css.slice(start + 1, i);
        }
    }

    throw new Error('unbalanced braces in stylesheet');
}

function declaredTokens(block) {
    const tokens = new Map();
    const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match;

    while ((match = pattern.exec(block)) !== null) {
        tokens.set(match[1], match[2].trim());
    }

    return tokens;
}

async function readThemes() {
    const css = stripComments(await read(TOKENS));

    const lightIndex = css.indexOf(':root');
    assert.notEqual(lightIndex, -1, 'tokens.css must declare a :root block');

    const darkMediaIndex = css.indexOf('@media (prefers-color-scheme: dark)');
    assert.notEqual(darkMediaIndex, -1, 'tokens.css must declare a dark-scheme block');

    const darkRootIndex = css.indexOf(':root', darkMediaIndex);
    assert.notEqual(darkRootIndex, -1, 'the dark-scheme block must redeclare :root');
    assert.ok(lightIndex < darkMediaIndex, 'the light :root must come before the dark block');

    return {
        light: declaredTokens(blockAt(css, lightIndex)),
        dark: declaredTokens(blockAt(css, darkRootIndex))
    };
}

/*
 * 只在浅色块定义、不随主题变的 token。
 * 用显式白名单而不是「名字里带 space/radius 就跳过」这类启发式——
 * 启发式会把将来新增的主题相关 token 悄悄放行，那道门禁就成了摆设。
 */
const THEME_INDEPENDENT = new Set([
    '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6',
    '--radius-sm', '--radius-md', '--radius-lg', '--radius-full',
    '--font-sans', '--font-serif',
    '--text-xs', '--text-sm', '--text-base', '--text-lg', '--text-xl', '--text-2xl',
    '--leading-tight', '--leading-normal', '--leading-canon',
    '--transition'
]);

function srgbToLinear(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
    const value = hex.replace('#', '');
    const expanded = value.length === 3
        ? value.split('').map(char => char + char).join('')
        : value;

    assert.equal(expanded.length, 6, `expected a 6-digit hex colour, received: ${hex}`);

    const [r, g, b] = [0, 2, 4].map(offset =>
        srgbToLinear(Number.parseInt(expanded.slice(offset, offset + 2), 16))
    );

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
    const a = relativeLuminance(foreground);
    const b = relativeLuminance(background);
    const [lighter, darker] = a > b ? [a, b] : [b, a];

    return (lighter + 0.05) / (darker + 0.05);
}

test('only tokens.css carries raw hex colours', async () => {
    for (const file of CONSUMERS) {
        const css = stripComments(await read(file));
        // (?![\w-]) 挡掉 id 选择器：#accent 会先匹配 #acce 再回溯到 #acc，
        // 两次都被后随的字母否掉。
        const rawHex = css.match(/#[0-9a-fA-F]{3,8}(?![\w-])/g) ?? [];

        assert.deepEqual(
            rawHex,
            [],
            `${file} must reference colours through var(--*), found raw hex: ${rawHex.join(', ')}`
        );
    }
});

test('the light and dark themes declare the same token names', async () => {
    const { light, dark } = await readThemes();

    const themed = [...light.keys()].filter(name => !THEME_INDEPENDENT.has(name));
    const missingInDark = themed.filter(name => !dark.has(name));
    const strayInDark = [...dark.keys()].filter(name => !light.has(name));
    const wronglyRedeclared = [...dark.keys()].filter(name => THEME_INDEPENDENT.has(name));

    assert.deepEqual(missingInDark, [], 'every themed token must be redeclared for dark mode');
    assert.deepEqual(strayInDark, [], 'dark mode must not invent tokens the light theme lacks');
    assert.deepEqual(
        wronglyRedeclared,
        [],
        'spacing, radius, type and motion tokens do not vary by theme'
    );

    for (const name of THEME_INDEPENDENT) {
        assert.ok(light.has(name), `tokens.css is missing ${name}`);
    }
});

/*
 * 对比度按 WCAG 2.1 算，浅深两套都要过。
 * 这道门禁的由来：改版前 .hero 是白字压 #d4af37 金底，对比度 1.9:1。
 * 光靠肉眼看「金色挺好看」是发现不了的，得让数字说话。
 */
test('key foreground/background pairs clear WCAG contrast in both themes', async () => {
    const themes = await readThemes();
    const pairs = [
        { foreground: '--ink-0', background: '--surface', minimum: 7, note: '正文对卡片底（AAA）' },
        { foreground: '--ink-2', background: '--surface', minimum: 4.5, note: '弱化文字对卡片底' },
        { foreground: '--on-accent', background: '--accent', minimum: 4.5, note: '主按钮文字对朱砂' },
        { foreground: '--gold-text', background: '--surface', minimum: 4.5, note: '金色调文字对卡片底' },
        { foreground: '--ok', background: '--ok-soft', minimum: 4.5, note: '「已连接」状态按钮的字对它的浅底' },
        { foreground: '--footer-link', background: '--footer-bg', minimum: 4.5, note: '页脚链接对页脚底' }
    ];

    for (const [themeName, tokens] of Object.entries(themes)) {
        for (const { foreground, background, minimum, note } of pairs) {
            const fg = tokens.get(foreground);
            const bg = tokens.get(background);

            assert.ok(fg, `${themeName} theme is missing ${foreground}`);
            assert.ok(bg, `${themeName} theme is missing ${background}`);

            const ratio = contrastRatio(fg, bg);

            assert.ok(
                ratio >= minimum,
                `${themeName}: ${note} —— ${foreground} ${fg} 压 ${background} ${bg} `
                + `只有 ${ratio.toFixed(2)}:1，要求 ≥ ${minimum}:1`
            );
        }
    }
});

/*
 * --gold 对 --surface 只有 3.1:1，当正文色就是不可读的。
 * 这个低对比度是刻意的（金色是点缀，不是文字色），所以不能靠上面那条对比度门禁
 * 去卡它——只能直接禁止把它赋给 color。border-color / background / fill / stroke 照用不误。
 */
test('gold is a decorative token, never a text colour', async () => {
    const { light } = await readThemes();

    assert.ok(
        contrastRatio(light.get('--gold'), light.get('--surface')) < 4.5,
        'this gate exists because --gold is deliberately too light for text; '
        + 'if --gold now clears 4.5:1 the gate is obsolete and should be reconsidered'
    );

    for (const file of CONSUMERS) {
        const css = stripComments(await read(file));
        // 负向后顾挡住 border-color / background-color / caret-color 这些同样以 color: 结尾的属性
        const misuse = css.match(/(?<![-\w])color\s*:\s*var\(\s*--gold\s*\)/g) ?? [];

        assert.deepEqual(
            misuse,
            [],
            `${file} uses --gold as a text colour; use --gold-text instead`
        );
    }
});
