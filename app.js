console.log('App.js loaded');

function initApp() {
    console.log('Initializing App Helpers...');

    // Initialize Background Particles
    if (!document.querySelector('.floating-particle')) {
        const p1 = document.createElement('div'); p1.className = 'floating-particle particle-1';
        const p2 = document.createElement('div'); p2.className = 'floating-particle particle-2';
        const p3 = document.createElement('div'); p3.className = 'floating-particle particle-3';
        document.body.appendChild(p1);
        document.body.appendChild(p2);
        document.body.appendChild(p3);
    }
}

// Run immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
