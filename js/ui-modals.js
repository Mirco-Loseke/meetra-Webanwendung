/* ========================================================= */
/* ==================== UI MODALS MODULE =================== */
/* ========================================================= */

window.showToast = function (message) {
    const toast = document.getElementById('toast');
    if (!toast) {
        alert(message);
        return;
    }
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.style.display = 'block';
    
    // Reset animation if active
    toast.style.animation = 'none';
    toast.offsetHeight; // trigger reflow
    toast.style.animation = null;

    setTimeout(() => {
        toast.classList.add('hidden');
        toast.style.display = 'none';
    }, 4000);
};

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
