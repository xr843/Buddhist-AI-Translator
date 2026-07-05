# Implementation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current demo into a safer, testable static web app with an optional hardened Worker proxy, glossary-aware translation prompts, reliable shortcuts, and accurate docs.

**Architecture:** Keep the app static and dependency-light. Add a Node built-in test harness for pure modules and Worker logic, keep browser behavior verified with a local HTTP smoke check, and avoid a full framework migration.

**Tech Stack:** HTML/CSS/ES modules, Cloudflare Worker module syntax, Node.js built-in `node:test`, Playwright CLI for smoke screenshots when available.

---

## File Structure

- `package.json`: project scripts for syntax checks, unit tests, and smoke checks.
- `tests/`: Node test files for Worker security, translator prompt/glossary behavior, and UI source assertions.
- `src/translator.js`: glossary loading, prompt construction, proxy request shape, and fallback behavior.
- `src/ui.js`: keyboard shortcuts and API-mode UI messaging.
- `src/config.js`: API mode configuration metadata.
- `worker/worker.js`: strict CORS, server-side prompt construction, text validation, and rate limit defaults.
- `worker/README.md`: deployment and security documentation.
- `styles.css`: layout correction for fixed footer overlap.
- `README.md` and `CONTRIBUTING.md`: updated usage, architecture, and contribution instructions.

## Task 1: Test and Script Baseline

**Files:**
- Create: `package.json`
- Create: `tests/syntax.test.mjs`

- [x] Add `package.json` scripts: `test`, `check:syntax`, and `verify`.
- [x] Add a syntax test that imports browser modules under minimal `localStorage` and DOM stubs.
- [x] Run `npm test` and confirm the initial harness fails only for missing/untestable behavior, not setup errors.

## Task 2: Harden Worker Proxy

**Files:**
- Modify: `worker/worker.js`
- Modify: `worker/README.md`
- Create: `tests/worker.test.mjs`

- [ ] Write tests for exact origin allow-listing, rejected origin spoofing, Worker-side prompt construction, missing API key response, invalid text length response, and CORS preflight headers.
- [ ] Run `node --test tests/worker.test.mjs` and confirm expected failures before implementation.
- [ ] Update Worker so clients send only `text`, `sourceLang`, and `targetLang`; build the DeepSeek prompt server-side.
- [ ] Replace `startsWith` origin checks with exact URL origin matching.
- [ ] Keep KV rate limit supported and document it as required for public shared deployments.
- [ ] Re-run Worker tests and `node --check worker/worker.js`.

## Task 3: Glossary-Aware Translator

**Files:**
- Modify: `src/translator.js`
- Modify: `src/config.js`
- Create: `tests/translator.test.mjs`

- [ ] Write tests for glossary extraction from `terms.json`, prompt inclusion of matched terms, proxy body omitting raw prompt, and fallback returning glossary guidance instead of pretending to translate whole passages.
- [ ] Run `node --test tests/translator.test.mjs` and confirm failures.
- [ ] Export small testable helpers from `src/translator.js`: `createTranslationPrompt`, `findMatchingTerms`, and `buildProxyPayload`.
- [ ] Update `translateWithDeepSeek` proxy mode to send the smaller payload.
- [ ] Re-run translator tests and syntax checks.

## Task 4: UI Behavior and Layout

**Files:**
- Modify: `src/ui.js`
- Modify: `styles.css`
- Create: `tests/ui-source.test.mjs`

- [ ] Write source-level tests that assert documented shortcuts are registered and fixed-footer overlap mitigation exists.
- [ ] Run `node --test tests/ui-source.test.mjs` and confirm failures.
- [ ] Add keyboard shortcuts for translate, copy, paste, and clear.
- [ ] Avoid intercepting shortcuts while typing unless the documented combination is used.
- [ ] Adjust page/footer layout so the footer does not cover the translation panel at 1280x720.
- [ ] Re-run UI tests and capture a Playwright screenshot.

## Task 5: Documentation and Cleanup

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `worker/README.md`
- Modify/Delete: `script.js`

- [x] Update README to describe HTTP/static-server usage rather than direct `file://` usage.
- [x] Update project structure to point at `src/`, `worker/`, and `tests/`.
- [x] Clarify API modes: BYOK local browser key vs Worker proxy.
- [x] Update contribution instructions to use `src/terms.json`, not the old `script.js` object.
- [x] Either remove `script.js` or clearly mark it as legacy if keeping it is necessary.
- [x] Run `npm run verify` and inspect `git diff`.

## Self-Review

- Spec coverage: the plan covers P0/P1/P2 foundations from the analysis: docs sync, Worker security, tests, shortcuts, layout, and glossary-aware prompts.
- Placeholder scan: no TBD/TODO placeholders are present.
- Scope control: deeper product work such as annotated export, expert review workflow, and release automation is intentionally left for later once the app has a testable baseline.
