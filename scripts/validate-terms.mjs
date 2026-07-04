import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function loadTermsFile(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

export function validateTermsData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('terms data must be an object of categories');
  }

  const seenTerms = new Map();

  for (const [categoryName, categoryTerms] of Object.entries(data)) {
    if (!categoryName.trim()) {
      throw new Error('category name must be a non-empty string');
    }

    if (!categoryTerms || typeof categoryTerms !== 'object' || Array.isArray(categoryTerms)) {
      throw new Error(`category "${categoryName}" must contain a term object`);
    }

    const entries = Object.entries(categoryTerms);
    if (entries.length === 0) {
      throw new Error(`category "${categoryName}" must contain at least one term`);
    }

    for (const [term, translation] of entries) {
      if (!term.trim()) {
        throw new Error(`term must be a non-empty string in category "${categoryName}"`);
      }

      if (typeof translation !== 'string' || !translation.trim()) {
        throw new Error(`translation for "${term}" must be a non-empty string`);
      }

      if (seenTerms.has(term)) {
        throw new Error(`duplicate term "${term}" found in "${seenTerms.get(term)}" and "${categoryName}"`);
      }

      seenTerms.set(term, categoryName);
    }
  }

  return true;
}

async function main() {
  const termsUrl = new URL('../src/terms.json', import.meta.url);
  const terms = await loadTermsFile(termsUrl);
  validateTermsData(terms);
  console.log(`Validated ${Object.keys(terms).length} term categories.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
