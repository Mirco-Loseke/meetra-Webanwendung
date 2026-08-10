// ==========================================================
// Bildbetrachter: Anhaenge, Galerie, Zoom und Wischgesten
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 6974-7212).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        let galleryImages = [];
        let currentGalleryIndex = 0;

        window.openServiceAttachments = function(files) {
            if (!files || files.length === 0) return;

            const existing = document.getElementById('service-attachments-modal');
            if (existing) existing.remove();

            const items = files.map((f, i) => {
                const url = typeof f === 'string' ? f : f.url;
                const name = typeof f === 'string' ? url.split('/').pop() : (f.name || url.split('/').pop());
                const type = typeof f === 'string' ? '' : (f.type || '');
                const isPdf = type.includes('pdf') || url.toLowerCase().endsWith('.pdf');
                const isImage = type.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/i.test(url);

                const thumb = isPdf
                    ? `<div style="width:48px;height:48px;background:rgba(239,68,68,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div>`
                    : isImage
                        ? `<img src="${url}" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
                        : `<div style="width:48px;height:48px;background:rgba(255,255,255,0.08);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg></div>`;

                const onclick = isPdf
                    ? `window.previewDocument('${url}', '${name.replace(/'/g,"\\'")}', 'application/pdf'); document.getElementById('service-attachments-modal').remove();`
                    : isImage
                        ? `window.openPhotosLightbox(${JSON.stringify(files.filter(f2 => { const u = typeof f2==='string'?f2:f2.url; return /\.(jpe?g|png|gif|webp|svg)$/i.test(u)||(typeof f2!=='string'&&f2.type?.startsWith('image/')); }).map(f2 => typeof f2==='string'?f2:f2.url))}, ${files.slice(0,i).filter(f2=>{ const u=typeof f2==='string'?f2:f2.url; return /\.(jpe?g|png|gif|webp|svg)$/i.test(u)||(typeof f2!=='string'&&f2.type?.startsWith('image/')); }).length})`
                        : `window.open('${url}', '_blank')`;

                return `<div onclick="${onclick}" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;cursor:pointer;transition:background 0.15s;background:rgba(255,255,255,0.03);" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                    ${thumb}
                    <span style="font-size:0.85rem;color:rgba(255,255,255,0.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
                </div>`;
            }).join('');

            const imageUrls = files
                .map(f => typeof f === 'string' ? f : f.url)
                .filter(u => /\.(jpe?g|png|gif|webp|svg)$/i.test(u) || (files.find(f => (typeof f !== 'string' ? f.url : f) === u) && typeof files.find(f => (typeof f !== 'string' ? f.url : f) === u) !== 'string' && files.find(f => (typeof f !== 'string' ? f.url : f) === u).type?.startsWith('image/')));
            const allImageUrls = files.map(f => typeof f === 'string' ? f : f.url).filter(u => { const f = files.find(x => (typeof x === 'string' ? x : x.url) === u); const t = typeof f === 'string' ? '' : (f?.type || ''); return t.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/i.test(u); });

            const grossansichtBtn = allImageUrls.length > 0
                ? `<button onclick="document.getElementById('service-attachments-modal').remove(); window.openPhotosLightbox(${JSON.stringify(allImageUrls).replace(/"/g, '&quot;')}, 0)" style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.5);color:#a78bfa;border-radius:8px;padding:4px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;white-space:nowrap;">Großansicht</button>`
                : '';

            const modal = document.createElement('div');
            modal.id = 'service-attachments-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);';
            modal.innerHTML = `
                <div style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:1.5rem;width:min(420px,90vw);max-height:80vh;display:flex;flex-direction:column;gap:12px;box-shadow:0 25px 60px rgba(0,0,0,0.5);">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="font-size:1rem;font-weight:600;color:white;display:flex;align-items:center;gap:8px;min-width:0;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                            Anhänge (${files.length})
                        </span>
                        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                            ${grossansichtBtn}
                            <button onclick="document.getElementById('service-attachments-modal').remove()" style="background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;">✕</button>
                        </div>
                    </div>
                    <div style="overflow-y:auto;display:flex;flex-direction:column;gap:4px;">${items}</div>
                </div>`;
            modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
            document.body.appendChild(modal);
        };

        let lbxZoom = 1, lbxPanX = 0, lbxPanY = 0;
        let lbxDragging = false, lbxDragStartX = 0, lbxDragStartY = 0, lbxDragPanX = 0, lbxDragPanY = 0;
        let lbxPinchDist = null, lbxSwipeStartX = 0, lbxLastTap = 0;

        function lbxApplyTransform(animate) {
            const img = document.getElementById('lightbox-img');
            if (!img) return;
            img.style.transition = animate ? 'transform 0.2s ease' : 'none';
            img.style.transform = `translate(calc(-50% + ${lbxPanX}px), calc(-50% + ${lbxPanY}px)) scale(${lbxZoom})`;
            img.style.cursor = lbxZoom > 1 ? 'grab' : 'default';
            const resetBtn = document.getElementById('lbx-reset');
            if (resetBtn) resetBtn.style.display = lbxZoom > 1 ? 'block' : 'none';
            ['lightbox-prev','lightbox-next','lbx-close'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.opacity = lbxZoom > 1 ? '0.25' : '1';
            });
        }

        function lbxResetZoom() {
            lbxZoom = 1; lbxPanX = 0; lbxPanY = 0;
            lbxApplyTransform(true);
        }

        window.openPhotosLightbox = function (images, startIndex) {
            if (!images || images.length === 0 || !images[0]) return;
            galleryImages = images;
            currentGalleryIndex = startIndex || 0;
            const lightbox = document.getElementById('photos-lightbox');
            if (!lightbox) return;
            lbxResetZoom();
            lightbox.style.display = 'block';
            updateLightboxUI();
            document.body.style.overflow = 'hidden';
        };

        window.closePhotosLightbox = function () {
            const lightbox = document.getElementById('photos-lightbox');
            if (lightbox) lightbox.style.display = 'none';
            document.body.style.overflow = '';
            lbxResetZoom();
        };

        window.navigateLightbox = function (direction) {
            if (galleryImages.length <= 1) return;
            lbxResetZoom();
            currentGalleryIndex = (currentGalleryIndex + direction + galleryImages.length) % galleryImages.length;
            updateLightboxUI();
        };

        function updateLightboxUI() {
            const img = document.getElementById('lightbox-img');
            const counter = document.getElementById('lightbox-counter');
            const prevBtn = document.getElementById('lightbox-prev');
            const nextBtn = document.getElementById('lightbox-next');
            if (img) img.src = galleryImages[currentGalleryIndex];
            if (counter) counter.innerText = `${currentGalleryIndex + 1} / ${galleryImages.length}`;
            const single = galleryImages.length <= 1;
            if (prevBtn) prevBtn.style.display = single ? 'none' : 'flex';
            if (nextBtn) nextBtn.style.display = single ? 'none' : 'flex';
            lbxApplyTransform(false);
        }

        (function initLightboxEvents() {
            const lb = document.getElementById('photos-lightbox');
            if (!lb) return;

            // Wheel zoom
            lb.addEventListener('wheel', e => {
                e.preventDefault();
                const rect = lb.getBoundingClientRect();
                const cx = (e.clientX - rect.left) - rect.width / 2;
                const cy = (e.clientY - rect.top) - rect.height / 2;
                const factor = e.deltaY < 0 ? 1.12 : 0.89;
                const newZoom = Math.min(Math.max(lbxZoom * factor, 1), 8);
                const dz = newZoom / lbxZoom;
                lbxPanX = cx * (1 - dz) + lbxPanX * dz;
                lbxPanY = cy * (1 - dz) + lbxPanY * dz;
                lbxZoom = newZoom;
                if (lbxZoom === 1) { lbxPanX = 0; lbxPanY = 0; }
                lbxApplyTransform(false);
            }, { passive: false });

            // Mouse drag
            lb.addEventListener('mousedown', e => {
                if (lbxZoom <= 1 || e.button !== 0) return;
                lbxDragging = true;
                lbxDragStartX = e.clientX; lbxDragStartY = e.clientY;
                lbxDragPanX = lbxPanX; lbxDragPanY = lbxPanY;
                const img = document.getElementById('lightbox-img');
                if (img) img.style.cursor = 'grabbing';
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!lbxDragging) return;
                lbxPanX = lbxDragPanX + (e.clientX - lbxDragStartX);
                lbxPanY = lbxDragPanY + (e.clientY - lbxDragStartY);
                lbxApplyTransform(false);
            });
            document.addEventListener('mouseup', () => {
                if (!lbxDragging) return;
                lbxDragging = false;
                const img = document.getElementById('lightbox-img');
                if (img) img.style.cursor = lbxZoom > 1 ? 'grab' : 'default';
            });

            // Touch
            lb.addEventListener('touchstart', e => {
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    lbxPinchDist = Math.hypot(dx, dy);
                    lbxDragStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    lbxDragStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    lbxDragPanX = lbxPanX; lbxDragPanY = lbxPanY;
                } else if (e.touches.length === 1) {
                    lbxSwipeStartX = e.touches[0].clientX;
                    if (lbxZoom > 1) {
                        lbxDragging = true;
                        lbxDragStartX = e.touches[0].clientX; lbxDragStartY = e.touches[0].clientY;
                        lbxDragPanX = lbxPanX; lbxDragPanY = lbxPanY;
                    }
                }
            }, { passive: true });

            lb.addEventListener('touchmove', e => {
                e.preventDefault();
                if (e.touches.length === 2 && lbxPinchDist !== null) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const newDist = Math.hypot(dx, dy);
                    const rect = lb.getBoundingClientRect();
                    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    const cx = midX - rect.left - rect.width / 2;
                    const cy = midY - rect.top - rect.height / 2;
                    const newZoom = Math.min(Math.max(lbxZoom * (newDist / lbxPinchDist), 1), 8);
                    const dz = newZoom / lbxZoom;
                    lbxPanX = cx * (1 - dz) + lbxPanX * dz + (midX - lbxDragStartX);
                    lbxPanY = cy * (1 - dz) + lbxPanY * dz + (midY - lbxDragStartY);
                    lbxZoom = newZoom;
                    lbxPinchDist = newDist;
                    lbxDragStartX = midX; lbxDragStartY = midY;
                    if (lbxZoom === 1) { lbxPanX = 0; lbxPanY = 0; }
                    lbxApplyTransform(false);
                } else if (e.touches.length === 1 && lbxDragging) {
                    lbxPanX = lbxDragPanX + (e.touches[0].clientX - lbxDragStartX);
                    lbxPanY = lbxDragPanY + (e.touches[0].clientY - lbxDragStartY);
                    lbxApplyTransform(false);
                }
            }, { passive: false });

            lb.addEventListener('touchend', e => {
                if (e.touches.length < 2) lbxPinchDist = null;
                if (e.touches.length === 0) {
                    lbxDragging = false;
                    if (lbxZoom <= 1) {
                        const dx = (e.changedTouches[0]?.clientX ?? lbxSwipeStartX) - lbxSwipeStartX;
                        if (Math.abs(dx) > 60) navigateLightbox(dx < 0 ? 1 : -1);
                    }
                    const now = Date.now();
                    if (now - lbxLastTap < 300) lbxResetZoom();
                    lbxLastTap = now;
                }
            }, { passive: true });

            // Keyboard
            document.addEventListener('keydown', e => {
                const lightbox = document.getElementById('photos-lightbox');
                if (!lightbox || lightbox.style.display === 'none') return;
                if (e.key === 'Escape') closePhotosLightbox();
                if (e.key === 'ArrowLeft') navigateLightbox(-1);
                if (e.key === 'ArrowRight') navigateLightbox(1);
                if (e.key === '0') lbxResetZoom();
            });
        })();
