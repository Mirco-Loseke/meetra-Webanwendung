// ==========================================================
// Glas-Auswahlliste: <select> → eigenes Dropdown im Glas-Stil
// ==========================================================
// Stammt aus js/accounting.js (Buchhaltung, entfernt 2026-09-29) — wird
// weiter von js/listen.js (Angebote-Filter) über initGlassSelect benutzt.
// ==========================================================

window.openGlassDropdown = function(anchorEl, options, onSelectCallback) {
    let portal = document.getElementById('glass-dropdown-portal');
    if (!portal) {
        portal = document.createElement('div');
        portal.id = 'glass-dropdown-portal';
        portal.className = 'hide-scrollbar';
        portal.style.cssText = 'position: fixed; max-height: 250px; overflow-y: auto; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; z-index: 999999; box-shadow: 0 10px 40px rgba(0,0,0,0.5); padding: 5px;';
        document.body.appendChild(portal);
    } else {
        portal.style.background = '#0f172a';
    }
    
    portal.innerHTML = options.map((opt, i) => `
        <div style="padding: 10px 12px; cursor: pointer; border-radius: 8px; font-size: 0.85rem; color: ${opt.selected ? 'var(--color-primary-green)' : (opt.color || '#fff')}; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s; font-weight: ${opt.selected ? '700' : '500'}; background: ${opt.selected ? 'rgba(16,185,129,0.1)' : 'transparent'};"
             onmouseover="if(!this.dataset.selected) this.style.background='rgba(255,255,255,0.05)'" 
             onmouseout="if(!this.dataset.selected) this.style.background='transparent'"
             data-selected="${opt.selected ? 'true' : ''}"
             data-index="${i}">
            ${opt.label}
            ${opt.selected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
    `).join('');

    const rect = anchorEl.getBoundingClientRect();
    portal.style.display = 'block';
    const portalHeight = portal.offsetHeight;
    const viewportHeight = window.innerHeight;

    if (rect.bottom + portalHeight > viewportHeight && rect.top - portalHeight > 0) {
        portal.style.top = (rect.top - portalHeight - 4) + 'px';
    } else {
        portal.style.top = (rect.bottom + 4) + 'px';
    }
    portal.style.left = rect.left + 'px';
    portal.style.width = Math.max(rect.width, 150) + 'px';

    portal.innerHTML = options.map((opt, i) => `
        <div style="padding: 10px 12px; cursor: pointer; border-radius: 8px; font-size: 0.85rem; color: ${opt.selected ? 'var(--color-primary-green)' : (opt.color || '#fff')}; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s; font-weight: ${opt.selected ? '700' : '500'}; background: ${opt.selected ? 'rgba(16,185,129,0.1)' : 'transparent'};"
             onmouseover="if(!this.dataset.selected) this.style.background='rgba(255,255,255,0.05)'" 
             onmouseout="if(!this.dataset.selected) this.style.background='transparent'"
             data-selected="${opt.selected ? 'true' : ''}"
             data-index="${i}">
            ${opt.label}
            ${opt.selected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
    `).join('');

    Array.from(portal.children).forEach((child) => {
        child.onclick = (e) => {
            e.stopPropagation();
            portal.style.display = 'none';
            const idx = parseInt(child.dataset.index);
            onSelectCallback(options[idx].value, options[idx].label);
            document.removeEventListener('click', window._glassDropdownCloseListener);
        };
    });

    const closeListener = (e) => {
        if (!anchorEl.contains(e.target) && !portal.contains(e.target)) {
            portal.style.display = 'none';
            document.removeEventListener('click', closeListener);
        }
    };
    
    document.removeEventListener('click', window._glassDropdownCloseListener);
    window._glassDropdownCloseListener = closeListener;
    setTimeout(() => document.addEventListener('click', closeListener), 10);
};

window.initGlassSelect = function(selectEl) {
    if (!selectEl || selectEl.dataset.glassInitialized) return;
    selectEl.dataset.glassInitialized = "true";
    
    const wrapper = document.createElement('div');
    wrapper.className = selectEl.className;
    wrapper.style.cssText = selectEl.style.cssText;
    
    if (!wrapper.classList.contains('hidden')) wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.cursor = 'pointer';
    wrapper.style.position = 'relative'; 
    wrapper.style.userSelect = 'none';
    
    selectEl.className = 'real-select-hidden';
    selectEl.style.display = 'none';
    
    const textSpan = document.createElement('span');
    textSpan.style.flex = '1';
    textSpan.style.overflow = 'hidden';
    textSpan.style.textOverflow = 'ellipsis';
    textSpan.style.whiteSpace = 'nowrap';
    textSpan.style.pointerEvents = 'none';
    
    const icon = document.createElement('div');
    icon.style.pointerEvents = 'none';
    icon.style.display = 'flex';
    icon.style.marginLeft = '8px';
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#fff;"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    
    wrapper.appendChild(textSpan);
    wrapper.appendChild(icon);
    
    function updateText() {
        if (selectEl.selectedIndex >= 0) {
            const opt = selectEl.options[selectEl.selectedIndex];
            textSpan.textContent = opt.text;
            textSpan.style.color = opt.value ? (wrapper.style.color || '#fff') : 'rgba(255,255,255,0.4)';
            
            // Special styling for workshop machine dropdown placeholders or centered selects
            if (wrapper.className.includes('machine-workshop') || wrapper.className.includes('centered-select')) {
                textSpan.style.flex = '1';
                textSpan.style.textAlign = 'center';
                wrapper.style.justifyContent = 'center';
                
                if (opt.value) {
                    textSpan.style.color = 'var(--color-primary-green)';
                    icon.style.display = 'flex';
                } else {
                    icon.style.display = 'none';
                }
            } else {
                textSpan.style.textAlign = 'left';
                textSpan.style.flex = '1';
                wrapper.style.justifyContent = 'space-between';
                icon.style.display = 'flex';
            }
        } else {
            textSpan.textContent = '';
        }
    }
    updateText();
    selectEl.addEventListener('change', updateText);

    wrapper.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const validOptions = Array.from(selectEl.options).filter(o => !o.disabled);
        const mappedOptions = validOptions.map(opt => ({
             value: opt.value,
             label: opt.text,
             selected: opt.value === selectEl.value,
             // Optionale Textfarbe pro Eintrag via <option data-color="..."> (z.B. Angebote-
             // Maschinenfilter: grün = echte Maschine, orange = Freitext-Bezeichnung)
             color: (opt.dataset && opt.dataset.color) || null
        }));

        window.openGlassDropdown(wrapper, mappedOptions, (val, label) => {
            selectEl.value = val;
            updateText();
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        });
    };

    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl); 
};
