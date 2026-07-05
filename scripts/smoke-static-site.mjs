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

    await page.goto(server.origin, { waitUntil: 'networkidle' });
    await page.locator('#source-text').fill('观自在菩萨');
    await page.locator('#target-lang').selectOption('en');
    await page.locator('#translate-btn').click();

    await page.locator('.translation-text').waitFor({ state: 'visible' });
    const translationText = (await page.locator('.translation-text').textContent() || '').trim();
    if (!/Avalokiteshvara Bodhisattva/.test(translationText)) {
      throw new Error(`Expected built-in glossary translation, received: ${translationText}`);
    }

    await page.locator('#copy-btn').click();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    if (!/Avalokiteshvara Bodhisattva/.test(clipboardText)) {
      throw new Error(`Expected copied translation text, received: ${clipboardText}`);
    }

    await page.locator('#clear-input').click();
    const sourceText = await page.locator('#source-text').inputValue();
    const charCount = (await page.locator('.char-count').textContent() || '').trim();
    const placeholderVisible = await page.locator('.placeholder').isVisible();

    if (sourceText !== '' || charCount !== '0 / 5000' || !placeholderVisible) {
      throw new Error('Clear input did not reset source text, character count, and result placeholder');
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
