import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

function contentTypeFor(filePath) {
  return mimeTypes.get(path.extname(filePath)) || 'application/octet-stream';
}

function resolveRequestPath(url) {
  const requestUrl = new URL(url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(repoRoot, relativePath);

  if (!filePath.startsWith(repoRoot + path.sep) && filePath !== repoRoot) {
    return null;
  }

  return filePath;
}

function startStaticServer() {
  const server = createServer(async (request, response) => {
    const filePath = resolveRequestPath(request.url || '/');

    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': contentTypeFor(filePath),
        'Cache-Control': 'no-store'
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Static smoke server did not expose a TCP port'));
        return;
      }

      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        async close() {
          await new Promise((done, fail) => {
            server.close((error) => {
              if (error) fail(error);
              else done();
            });
          });
        }
      });
    });
  });
}

const MITRA_TRANSLATION = 'Avalokiteshvara Bodhisattva, practising the deep perfection of wisdom.';
// 浏览器不能直连 dharmamitra.org（对方在实际响应里重复发 CORS 头），
// 所以 MITRA 一律走 Worker 中转。这里假装已经部署了一个。
// 用 *.workers.dev，因为 index.html 的 CSP connect-src 放行的正是这个通配符
const PROXY_ORIGIN = 'https://smoke-translator.workers.dev';

/**
 * MITRA 是默认引擎，所以冒烟测试必须把中转拦下来。
 * 否则这个测试会依赖外网、依赖对方服务可用，还会在 CI 里给人家白白发请求。
 */
async function stubMitra(page, { failTranslate = false } = {}) {
  await page.route(`${PROXY_ORIGIN}/**`, async route => {
    const url = route.request().url();

    if (url.includes('/mitra/translate')) {
      if (failTranslate) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"down"}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translation: MITRA_TRANSLATION })
      });
      return;
    }

    if (url.includes('/mitra/search')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [{
            segmentnr: 'ZH_T08_0251_001:0848c07',
            lang: 'zh',
            source: 'ZH_T08_0251',
            title: '般若波羅蜜多心經',
            text: '觀自在菩薩行深般若波羅蜜多時',
            src_link: 'https://dharmamitra.org/nexus/db/zh/ZH_T08_0251/text'
          }]
        })
      });
      return;
    }

    await route.fulfill({ status: 404, body: 'not stubbed' });
  });
}

async function runSmokeCheck() {
  const server = await startStaticServer();
  let browser;

  try {
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      permissions: ['clipboard-read', 'clipboard-write']
    });

    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await stubMitra(page);
    // 中转地址存在浏览器本地，等同于用户在设置里填过一次
    await page.addInitScript(origin => {
      window.localStorage.setItem('translator_proxy_url', origin);
    }, PROXY_ORIGIN);
    await page.goto(server.origin, { waitUntil: 'networkidle' });

    // 1. 默认路径：不配任何密钥，直接走 MITRA
    await page.locator('#source-text').fill('观自在菩萨');
    await page.locator('#target-lang').selectOption('en');
    await page.locator('#translate-btn').click();

    await page.locator('.translation-text').waitFor({ state: 'visible' });
    const mitraText = (await page.locator('.translation-text').textContent() || '').trim();
    if (mitraText !== MITRA_TRANSLATION) {
      throw new Error(`Expected the MITRA translation, received: ${mitraText}`);
    }

    const metaText = (await page.locator('#result-meta').textContent() || '').trim();
    if (!/MITRA/.test(metaText)) {
      throw new Error(`Expected the result meta line to name the MITRA engine, received: ${metaText}`);
    }

    // 2. 藏经溯源
    await page.locator('#provenance-btn').click();
    await page.locator('#provenance-panel .provenance-list li').first().waitFor({ state: 'visible' });
    const provenanceText = (await page.locator('#provenance-panel').textContent() || '').trim();
    for (const expected of ['般若波羅蜜多心經', 'ZH_T08_0251_001:0848c07']) {
      if (!provenanceText.includes(expected)) {
        throw new Error(`Provenance panel is missing expected text: ${expected}`);
      }
    }
    const provenanceLink = await page.locator('#provenance-panel .prov-link a').first().getAttribute('href');
    if (provenanceLink !== 'https://dharmamitra.org/nexus/db/zh/ZH_T08_0251/text') {
      throw new Error(`Provenance deep link should be used verbatim, received: ${provenanceLink}`);
    }

    await page.locator('#copy-btn').click();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    if (!/Avalokiteshvara Bodhisattva/.test(clipboardText)) {
      throw new Error(`Expected copied translation text, received: ${clipboardText}`);
    }

    // 3. 译风设置改变后必须重新翻译，不能拿旧缓存糊弄
    const styleSummaryBefore = (await page.locator('#style-summary').textContent() || '').trim();
    await page.locator('#style-panel').evaluate(node => { node.open = true; });
    await page.locator('#style-literalness').selectOption('literal');
    const styleSummaryAfter = (await page.locator('#style-summary').textContent() || '').trim();
    if (!styleSummaryAfter || styleSummaryAfter === styleSummaryBefore) {
      throw new Error(`Style summary did not update: ${styleSummaryBefore} -> ${styleSummaryAfter}`);
    }

    // 4. 多本合参：勾上以后另外三路写本的输入框要出现，与主写本重复的那一路要藏起来
    await page.locator('#multi-witness-toggle').check();
    await page.locator('#witness-grid').waitFor({ state: 'visible' });
    await page.locator('#source-lang').selectOption('zh-classical');
    if (await page.locator('.witness-field[data-lang="zh-classical"]').isVisible()) {
      throw new Error('The witness field duplicating the primary source language should be hidden');
    }
    for (const lang of ['sa', 'pi', 'bo']) {
      if (!(await page.locator(`.witness-field[data-lang="${lang}"]`).isVisible())) {
        throw new Error(`Expected the ${lang} witness field to be visible in multi-witness mode`);
      }
    }
    await page.locator('#multi-witness-toggle').uncheck();
    await page.locator('#source-lang').selectOption('auto');

    const download = page.waitForEvent('download');
    await page.locator('#download-btn').click();
    const downloadedFile = await download;
    const downloadedText = await readFile(await downloadedFile.path(), 'utf8');
    if (!/^buddhist-translation-\d{4}-\d{2}-\d{2}\.txt$/.test(downloadedFile.suggestedFilename())) {
      throw new Error(`Unexpected translation download filename: ${downloadedFile.suggestedFilename()}`);
    }
    for (const expectedText of ['源语言: 自动检测', '目标语言: 英文', '原文:', '观自在菩萨', '译文:', 'Avalokiteshvara Bodhisattva']) {
      if (!downloadedText.includes(expectedText)) {
        throw new Error(`Downloaded translation is missing expected text: ${expectedText}`);
      }
    }

    await page.locator('#clear-input').click();
    const sourceText = await page.locator('#source-text').inputValue();
    const charCount = (await page.locator('.char-count').textContent() || '').trim();
    const placeholderVisible = await page.locator('.placeholder').isVisible();

    if (sourceText !== '' || charCount !== '0 / 5000' || !placeholderVisible) {
      throw new Error('Clear input did not reset source text, character count, and result placeholder');
    }

    // 5. MITRA 挂掉时要退回内置术语模式，而不是白屏
    await page.unroute(`${PROXY_ORIGIN}/**`);
    await stubMitra(page, { failTranslate: true });
    await page.locator('#source-text').fill('观自在菩萨');
    await page.locator('#translate-btn').click();
    await page.locator('.translation-text').waitFor({ state: 'visible' });
    const fallbackText = (await page.locator('.translation-text').textContent() || '').trim();
    if (!/Avalokiteshvara Bodhisattva/.test(fallbackText)) {
      throw new Error(`Expected the built-in glossary fallback, received: ${fallbackText}`);
    }
    const fallbackMeta = (await page.locator('#result-meta').textContent() || '').trim();
    if (!/内置/.test(fallbackMeta)) {
      throw new Error(`Expected the fallback meta line to name the built-in mode, received: ${fallbackMeta}`);
    }

    if (pageErrors.length > 0) {
      throw new Error(`Browser page errors: ${pageErrors.join('; ')}`);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.close();
  }
}

await runSmokeCheck();
