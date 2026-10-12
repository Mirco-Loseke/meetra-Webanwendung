/* ========================================================= */
/* ==================== UI MODALS MODULE =================== */
/* ========================================================= */

// showToast steht in js/ui-feedback.js (Einblendung unten rechts).
//
// Hier stand frueher eine zweite Fassung, die ein Element #toast erwartete —
// das es im Markup nirgends (mehr) gibt. Sie fiel deshalb immer auf das
// blockierende alert() des Browsers zurueck. Und weil ui-modals.js NACH
// ui-feedback.js geladen wird, hat diese Fassung die schoene ueberschrieben:
// jede Meldung der ganzen App kam als Browser-Kasten mit „OK". Nicht
// wieder einfuehren; wer etwas melden will, ruft window.showToast auf.

window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
};

window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }, 300);
};

window.toggleCollapsibleSection = function (headerEl) {
    const section = headerEl.closest('.collapsible-section');
    if (!section) return;
    const content = section.querySelector('.section-content');
    const chevron = section.querySelector('.toggle-chevron');
    if (!content) return;

    const isHidden = content.style.display === 'none' || getComputedStyle(content).display === 'none';
    if (isHidden) {
        content.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        content.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
};
