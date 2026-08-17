import { loadTerms } from './translator.js';
import { initializeUI } from './ui.js';
import { copyrightYears } from './utils.js';

/** 页脚年份。HTML 里只写起始年当兜底，这里把当前年接上。 */
const COPYRIGHT_START_YEAR = 2025;

function renderCopyrightYears() {
    const target = document.getElementById('copyright-years');
    if (!target) return;
    const years = copyrightYears(COPYRIGHT_START_YEAR, new Date().getFullYear());
    // 算不出来就别动 HTML 里那个兜底值
    if (years) target.textContent = years;
}

document.addEventListener('DOMContentLoaded', async () => {
    renderCopyrightYears();
    await loadTerms();
    initializeUI();
});
