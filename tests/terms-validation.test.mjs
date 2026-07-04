import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  loadTermsFile,
  validateTermsData
} from '../scripts/validate-terms.mjs';

test('current terms file passes validation', async () => {
  const terms = await loadTermsFile(new URL('../src/terms.json', import.meta.url));

  assert.doesNotThrow(() => validateTermsData(terms));
});

test('terms validation rejects empty categories, terms, and translations', () => {
  assert.throws(
    () => validateTermsData({ '': { '佛': 'Buddha / बुद्ध' } }),
    /category name must be a non-empty string/
  );

  assert.throws(
    () => validateTermsData({ '基础概念': { '': 'Buddha / बुद्ध' } }),
    /term must be a non-empty string/
  );

  assert.throws(
    () => validateTermsData({ '基础概念': { '佛': '' } }),
    /translation for "佛" must be a non-empty string/
  );
});

test('terms validation rejects duplicate terms across categories', () => {
  assert.throws(
    () => validateTermsData({
      '基础概念': { '佛': 'Buddha / बुद्ध' },
      '重复分类': { '佛': 'Awakened one / बुद्ध' }
    }),
    /duplicate term "佛"/
  );
});

test('npm verify includes terms validation', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );

  assert.match(packageJson.scripts['check:terms'], /validate-terms\.mjs/);
  assert.match(packageJson.scripts.verify, /check:terms/);
});
