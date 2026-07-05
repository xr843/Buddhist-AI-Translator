import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('GitHub Actions verify workflow runs npm verification on PRs and master pushes', async () => {
  const workflow = await readProjectFile('.github/workflows/verify.yml');
  const packageJson = JSON.parse(await readProjectFile('package.json'));

  assert.match(workflow, /name:\s*Verify/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\[\s*master\s*\]/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm run verify/);
  assert.equal(packageJson.engines?.node, '>=22');
});

test('syntax verification uses the repository discovery script', async () => {
  const packageJson = JSON.parse(await readProjectFile('package.json'));
  const syntaxScript = await readProjectFile('scripts/check-syntax.mjs');

  assert.equal(packageJson.scripts?.['check:syntax'], 'node scripts/check-syntax.mjs');
  assert.match(syntaxScript, /src/);
  assert.match(syntaxScript, /worker/);
  assert.match(syntaxScript, /scripts/);
  assert.match(syntaxScript, /--check/);
});

test('pull request template asks for summary and test evidence', async () => {
  const template = await readProjectFile('.github/pull_request_template.md');

  assert.match(template, /Summary/);
  assert.match(template, /Test Plan/);
  assert.match(template, /npm run verify/);
});

test('issue templates cover bug reports and terminology contributions', async () => {
  const bug = await readProjectFile('.github/ISSUE_TEMPLATE/bug_report.md');
  const terminology = await readProjectFile('.github/ISSUE_TEMPLATE/terminology.md');

  assert.match(bug, /name:\s*Bug report/);
  assert.match(bug, /Browser/);
  assert.match(bug, /Steps to reproduce/);

  assert.match(terminology, /name:\s*Terminology contribution/);
  assert.match(terminology, /Source reference/);
  assert.match(terminology, /src\/terms\.json/);
});

test('CONTRIBUTING links to canonical GitHub templates without stale placeholders', async () => {
  const contributing = await readProjectFile('CONTRIBUTING.md');

  assert.match(contributing, /\.github\/pull_request_template\.md/);
  assert.match(contributing, /\.github\/ISSUE_TEMPLATE\/bug_report\.md/);
  assert.match(contributing, /\.github\/ISSUE_TEMPLATE\/terminology\.md/);
  assert.doesNotMatch(contributing, /### Pull Request 模板/);
  assert.doesNotMatch(contributing, /如果您希望添加邮箱联系方式/);
});
