import { loadTerms } from './translator.js';
import { initializeUI } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadTerms();
    initializeUI();
});
