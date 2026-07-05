import assert from 'node:assert/strict';
import test from 'node:test';

import { initSpeech, isSpeaking, speakResult, stopSpeaking } from '../src/speech.js';

function resultDiv(text) {
    return {
        textContent: text,
        querySelector() {
            return null;
        }
    };
}

function installSpeechEnvironment(synthesis, t) {
    const originalWindow = globalThis.window;
    const originalUtterance = globalThis.SpeechSynthesisUtterance;
    const originalSetTimeout = globalThis.setTimeout;

    globalThis.window = { speechSynthesis: synthesis };
    globalThis.SpeechSynthesisUtterance = class {
        constructor(text) {
            this.text = text;
        }
    };
    globalThis.setTimeout = (callback, _delay, ...args) => {
        callback(...args);
        return 0;
    };

    t.after(() => {
        stopSpeaking();
        if (originalWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = originalWindow;
        }

        if (originalUtterance === undefined) {
            delete globalThis.SpeechSynthesisUtterance;
        } else {
            globalThis.SpeechSynthesisUtterance = originalUtterance;
        }
        globalThis.setTimeout = originalSetTimeout;
    });
}

test('speakResult starts with the browser default voice when no voices are listed', (t) => {
    let speakCalls = 0;
    const synthesis = {
        speaking: false,
        onvoiceschanged: null,
        getVoices() {
            return [];
        },
        speak(utterance) {
            speakCalls += 1;
            this.speaking = true;
            assert.equal(utterance.text, 'Form is emptiness.');
            assert.equal(utterance.lang, 'en-US');
        },
        cancel() {
            this.speaking = false;
        }
    };

    installSpeechEnvironment(synthesis, t);
    initSpeech(() => 'en', () => resultDiv('翻译结果：Form is emptiness.'));

    const result = speakResult();

    assert.deepEqual(result, { action: 'started' });
    assert.equal(speakCalls, 1);
    assert.equal(isSpeaking(), true);
});

test('speakResult rejects prefix-only translation content without entering speaking state', (t) => {
    let speakCalls = 0;
    const synthesis = {
        speaking: false,
        onvoiceschanged: null,
        getVoices() {
            return [{ name: 'Default Chinese', lang: 'zh-CN', default: true }];
        },
        speak() {
            speakCalls += 1;
        },
        cancel() {
            this.speaking = false;
        }
    };

    installSpeechEnvironment(synthesis, t);
    initSpeech(() => 'zh', () => resultDiv('翻译结果：   '));

    const result = speakResult();

    assert.deepEqual(result, { error: 'no-content' });
    assert.equal(speakCalls, 0);
    assert.equal(isSpeaking(), false);
});

test('speakResult reports speaking state changes when speech naturally ends', (t) => {
    const stateChanges = [];
    const synthesis = {
        speaking: false,
        onvoiceschanged: null,
        getVoices() {
            return [{ name: 'Default English', lang: 'en-US', default: true }];
        },
        speak(utterance) {
            this.speaking = true;
            utterance.onend();
            this.speaking = false;
        },
        cancel() {
            this.speaking = false;
        }
    };

    installSpeechEnvironment(synthesis, t);
    initSpeech(
        () => 'en',
        () => resultDiv('翻译结果：Form is emptiness.'),
        speaking => stateChanges.push(speaking)
    );

    const result = speakResult();

    assert.deepEqual(result, { action: 'started' });
    assert.deepEqual(stateChanges, [true, false]);
    assert.equal(isSpeaking(), false);
});
