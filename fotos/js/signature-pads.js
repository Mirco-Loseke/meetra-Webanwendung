// ==========================================================
// Unterschriftenfelder: Kunde, Techniker, Fahrer, Benutzer
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 5484-5886).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================

        // Unterschrift platzsparend als PNG: auf die Striche zuschneiden und in ein
        // kleines Bild im Seitenverhältnis des PDF-Felds (70 × 22 mm) setzen.
        // Vorher ging die volle Zeichenfläche (≈ 560 × 300, 50–150 KB Base64) in die
        // Datenbank — jetzt ≈ 5–15 KB, und im PDF wird nichts mehr verzerrt.
        window.signaturKlein = function (canvas, opts) {
            const o = opts || {};
            const zielB = o.breite || 400;
            const verh = o.verhaeltnis || (70 / 22);
            try {
                const w = canvas.width, h = canvas.height;
                const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
                let x0 = w, y0 = h, x1 = -1, y1 = -1;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const i = (y * w + x) * 4;
                        // Strich = sichtbar (alpha) und nicht fast weiß
                        if (px[i + 3] > 40 && (px[i] + px[i + 1] + px[i + 2]) < 600) {
                            if (x < x0) x0 = x; if (x > x1) x1 = x;
                            if (y < y0) y0 = y; if (y > y1) y1 = y;
                        }
                    }
                }
                if (x1 < 0) return canvas.toDataURL('image/png');   // leer
                const rand = 6;
                x0 = Math.max(0, x0 - rand); y0 = Math.max(0, y0 - rand);
                x1 = Math.min(w - 1, x1 + rand); y1 = Math.min(h - 1, y1 + rand);
                const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
                const zielH = Math.round(zielB / verh);
                const f = Math.min(zielB / sw, zielH / sh, 1);
                const dw = Math.round(sw * f), dh = Math.round(sh * f);
                const out = document.createElement('canvas');
                out.width = zielB; out.height = zielH;
                const ctx = out.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, zielB, zielH);
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(canvas, x0, y0, sw, sh, Math.round((zielB - dw) / 2), Math.round((zielH - dh) / 2), dw, dh);
                // Reines Schwarz/Weiß statt Graustufen-Kanten: PNG komprimiert das um ein Vielfaches besser.
                const bild = ctx.getImageData(0, 0, zielB, zielH);
                const d = bild.data;
                for (let i = 0; i < d.length; i += 4) {
                    const v = (d[i] + d[i + 1] + d[i + 2]) < 540 ? 0 : 255;
                    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
                }
                ctx.putImageData(bild, 0, 0);
                return out.toDataURL('image/png');
            } catch (e) {
                return canvas.toDataURL('image/png');
            }
        };

        let signatureCanvas = null;
        let signatureCtx = null;
        let isDrawing = false;
        
        // Technician Signature Canvas State
        let techSignatureCanvas = null;
        let techSignatureCtx = null;
        let isTechDrawing = false;
        
        window.openSignaturePad = function() {
            console.log("openSignaturePad is called!");
            const modal = document.getElementById('signature-modal');
            if (!modal) {
                console.error("signature-modal element not found in DOM!");
                return;
            }
            
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
            
            // Wait for browser layout to complete before sizing the canvas
            setTimeout(() => {
                signatureCanvas = document.getElementById('signature-canvas');
                if (signatureCanvas) {
                    signatureCanvas.width = signatureCanvas.offsetWidth || 560;
                    signatureCanvas.height = signatureCanvas.offsetHeight || 300;
                    
                    signatureCtx = signatureCanvas.getContext('2d');
                    signatureCtx.strokeStyle = '#0f172a'; // dark stroke
                    signatureCtx.lineWidth = 3;
                    signatureCtx.lineCap = 'round';
                    signatureCtx.lineJoin = 'round';
                    
                    // Fill with white background
                    signatureCtx.fillStyle = '#ffffff';
                    signatureCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
                    
                    // If a signature already exists, draw it on the canvas
                    const existingSig = document.getElementById('service-customer-signature').value;
                    if (existingSig && existingSig.startsWith('data:image')) {
                        const img = new Image();
                        img.onload = function() {
                            signatureCtx.drawImage(img, 0, 0, signatureCanvas.width, signatureCanvas.height);
                        };
                        img.src = existingSig;
                    }
                    
                    setupSignatureEventListeners();
                }
            }, 50);
        };
        
        window.closeSignaturePad = function() {
            const modal = document.getElementById('signature-modal');
            if (modal) {
                modal.classList.remove('show');
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
        };
        
        function setupSignatureEventListeners() {
            if (!signatureCanvas) return;
            
            const getPos = (e) => {
                const rect = signatureCanvas.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                return {
                    x: clientX - rect.left,
                    y: clientY - rect.top
                };
            };
            
            const startDraw = (e) => {
                isDrawing = true;
                const pos = getPos(e);
                signatureCtx.beginPath();
                signatureCtx.moveTo(pos.x, pos.y);
                e.preventDefault();
            };
            
            const draw = (e) => {
                if (!isDrawing) return;
                const pos = getPos(e);
                signatureCtx.lineTo(pos.x, pos.y);
                signatureCtx.stroke();
                e.preventDefault();
            };
            
            const stopDraw = () => {
                isDrawing = false;
            };
            
            // Mouse
            signatureCanvas.onmousedown = startDraw;
            signatureCanvas.onmousemove = draw;
            signatureCanvas.onmouseup = stopDraw;
            signatureCanvas.onmouseleave = stopDraw;
            
            // Touch
            signatureCanvas.ontouchstart = startDraw;
            signatureCanvas.ontouchmove = draw;
            signatureCanvas.ontouchend = stopDraw;
            signatureCanvas.ontouchcancel = stopDraw;
        }
        
        window.clearSignatureCanvas = function() {
            if (!confirm("Möchten Sie die Zeichnung der Unterschrift wirklich zurücksetzen?")) return;
            if (signatureCtx && signatureCanvas) {
                signatureCtx.fillStyle = '#ffffff';
                signatureCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
            }
        };
        
        window.saveSignatureCanvas = function() {
            if (signatureCanvas) {
                const dataUrl = window.signaturKlein(signatureCanvas);
                document.getElementById('service-customer-signature').value = dataUrl;
                
                const sigPreviewImg = document.getElementById('signature-preview-img');
                if (sigPreviewImg) {
                    sigPreviewImg.src = dataUrl;
                    sigPreviewImg.classList.remove('hidden');
                    sigPreviewImg.style.display = 'block';
                }
                const sigPlaceholder = document.getElementById('signature-placeholder');
                if (sigPlaceholder) sigPlaceholder.classList.add('hidden');
                const sigClearBtn = document.getElementById('btn-clear-signature');
                if (sigClearBtn) sigClearBtn.classList.remove('hidden');
                
                window.closeSignaturePad();
            }
        };
        
        window.clearSignature = function() {
            if (!confirm("Möchten Sie die gespeicherte Unterschrift wirklich löschen?")) return;
            document.getElementById('service-customer-signature').value = '';
            const sigPreviewImg = document.getElementById('signature-preview-img');
            if (sigPreviewImg) {
                sigPreviewImg.src = '';
                sigPreviewImg.classList.add('hidden');
                sigPreviewImg.style.display = 'none';
            }
            const sigPlaceholder = document.getElementById('signature-placeholder');
            if (sigPlaceholder) sigPlaceholder.classList.remove('hidden');
            const sigClearBtn = document.getElementById('btn-clear-signature');
            if (sigClearBtn) sigClearBtn.classList.add('hidden');
        };

        // ── Technician Signature Pad ──────────────────────────────────────────
        window.openTechSignaturePad = function() {
            const modal = document.getElementById('tech-signature-modal');
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('show'));
            setTimeout(() => {
                techSignatureCanvas = document.getElementById('tech-signature-canvas');
                if (techSignatureCanvas) {
                    techSignatureCanvas.width = techSignatureCanvas.offsetWidth || 560;
                    techSignatureCanvas.height = techSignatureCanvas.offsetHeight || 300;
                    techSignatureCtx = techSignatureCanvas.getContext('2d');
                    techSignatureCtx.strokeStyle = '#0f172a';
                    techSignatureCtx.lineWidth = 3;
                    techSignatureCtx.lineCap = 'round';
                    techSignatureCtx.lineJoin = 'round';
                    techSignatureCtx.fillStyle = '#ffffff';
                    techSignatureCtx.fillRect(0, 0, techSignatureCanvas.width, techSignatureCanvas.height);
                    const existingSig = document.getElementById('service-tech-signature').value;
                    if (existingSig && existingSig.startsWith('data:image')) {
                        const img = new Image();
                        img.onload = function() { techSignatureCtx.drawImage(img, 0, 0, techSignatureCanvas.width, techSignatureCanvas.height); };
                        img.src = existingSig;
                    }
                    const getPos = (e) => {
                        const rect = techSignatureCanvas.getBoundingClientRect();
                        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                        return { x: clientX - rect.left, y: clientY - rect.top };
                    };
                    const startDraw = (e) => { isTechDrawing = true; const p = getPos(e); techSignatureCtx.beginPath(); techSignatureCtx.moveTo(p.x, p.y); e.preventDefault(); };
                    const draw = (e) => { if (!isTechDrawing) return; const p = getPos(e); techSignatureCtx.lineTo(p.x, p.y); techSignatureCtx.stroke(); e.preventDefault(); };
                    const stopDraw = () => { isTechDrawing = false; };
                    techSignatureCanvas.onmousedown = startDraw;
                    techSignatureCanvas.onmousemove = draw;
                    techSignatureCanvas.onmouseup = stopDraw;
                    techSignatureCanvas.onmouseleave = stopDraw;
                    techSignatureCanvas.ontouchstart = startDraw;
                    techSignatureCanvas.ontouchmove = draw;
                    techSignatureCanvas.ontouchend = stopDraw;
                    techSignatureCanvas.ontouchcancel = stopDraw;
                }
            }, 50);
        };

        window.closeTechSignaturePad = function() {
            const modal = document.getElementById('tech-signature-modal');
            if (modal) { modal.classList.remove('show'); modal.classList.add('hidden'); modal.style.display = 'none'; }
        };

        window.clearTechSignatureCanvas = function() {
            if (!confirm("Möchten Sie die Zeichnung der Unterschrift wirklich zurücksetzen?")) return;
            if (techSignatureCtx && techSignatureCanvas) {
                techSignatureCtx.fillStyle = '#ffffff';
                techSignatureCtx.fillRect(0, 0, techSignatureCanvas.width, techSignatureCanvas.height);
            }
        };

        window.saveTechSignatureCanvas = function() {
            if (techSignatureCanvas) {
                const dataUrl = window.signaturKlein(techSignatureCanvas);
                document.getElementById('service-tech-signature').value = dataUrl;
                const img = document.getElementById('tech-signature-preview-img');
                if (img) { img.src = dataUrl; img.classList.remove('hidden'); img.style.display = 'block'; }
                const ph = document.getElementById('tech-signature-placeholder');
                if (ph) ph.classList.add('hidden');
                const btn = document.getElementById('btn-clear-tech-signature');
                if (btn) btn.classList.remove('hidden');
                window._techSigIsAutofilled = false; // manuell gezeichnet, nicht mehr automatisch überschreiben
                window.closeTechSignaturePad();
            }
        };

        window.clearTechSignature = function() {
            if (!confirm("Möchten Sie die gespeicherte Unterschrift wirklich löschen?")) return;
            document.getElementById('service-tech-signature').value = '';
            const img = document.getElementById('tech-signature-preview-img');
            if (img) { img.src = ''; img.classList.add('hidden'); img.style.display = 'none'; }
            const ph = document.getElementById('tech-signature-placeholder');
            if (ph) ph.classList.remove('hidden');
            const btn = document.getElementById('btn-clear-tech-signature');
            if (btn) btn.classList.add('hidden');
            window._techSigIsAutofilled = false; // bewusst entfernt, nicht erneut automatisch befüllen
        };
        // ─────────────────────────────────────────────────────────────────────

        // ── Generic Driver/Mechanic Signature Pad (Einweisung, beliebig viele) ─
        // Reine Canvas-Mechanik hier; die eigentlichen Daten (driverSignatures pro
        // Checklist) verwaltet checklists.js, da activeChecklists dort lebt.
        let driverSignatureCanvas = null, driverSignatureCtx = null, isDriverSigDrawing = false;
        let driverSigTarget = null; // { templateId, index }

        window.openDriverSignaturePad = function(templateId, index) {
            driverSigTarget = { templateId, index };
            const modal = document.getElementById('driver-signature-modal');
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('show'));
            setTimeout(() => {
                driverSignatureCanvas = document.getElementById('driver-signature-canvas');
                if (driverSignatureCanvas) {
                    driverSignatureCanvas.width = driverSignatureCanvas.offsetWidth || 560;
                    driverSignatureCanvas.height = driverSignatureCanvas.offsetHeight || 300;
                    driverSignatureCtx = driverSignatureCanvas.getContext('2d');
                    driverSignatureCtx.strokeStyle = '#0f172a';
                    driverSignatureCtx.lineWidth = 3;
                    driverSignatureCtx.lineCap = 'round';
                    driverSignatureCtx.lineJoin = 'round';
                    driverSignatureCtx.fillStyle = '#ffffff';
                    driverSignatureCtx.fillRect(0, 0, driverSignatureCanvas.width, driverSignatureCanvas.height);
                    const existingSig = (typeof window.getDriverSignatureImage === 'function') ? window.getDriverSignatureImage(templateId, index) : '';
                    if (existingSig && existingSig.startsWith('data:image')) {
                        const img = new Image();
                        img.onload = function() { driverSignatureCtx.drawImage(img, 0, 0, driverSignatureCanvas.width, driverSignatureCanvas.height); };
                        img.src = existingSig;
                    }
                    const getPos = (e) => {
                        const rect = driverSignatureCanvas.getBoundingClientRect();
                        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                        return { x: clientX - rect.left, y: clientY - rect.top };
                    };
                    const startDraw = (e) => { isDriverSigDrawing = true; const p = getPos(e); driverSignatureCtx.beginPath(); driverSignatureCtx.moveTo(p.x, p.y); e.preventDefault(); };
                    const draw = (e) => { if (!isDriverSigDrawing) return; const p = getPos(e); driverSignatureCtx.lineTo(p.x, p.y); driverSignatureCtx.stroke(); e.preventDefault(); };
                    const stopDraw = () => { isDriverSigDrawing = false; };
                    driverSignatureCanvas.onmousedown = startDraw;
                    driverSignatureCanvas.onmousemove = draw;
                    driverSignatureCanvas.onmouseup = stopDraw;
                    driverSignatureCanvas.onmouseleave = stopDraw;
                    driverSignatureCanvas.ontouchstart = startDraw;
                    driverSignatureCanvas.ontouchmove = draw;
                    driverSignatureCanvas.ontouchend = stopDraw;
                    driverSignatureCanvas.ontouchcancel = stopDraw;
                }
            }, 50);
        };

        window.closeDriverSignaturePad = function() {
            const modal = document.getElementById('driver-signature-modal');
            if (modal) { modal.classList.remove('show'); modal.classList.add('hidden'); modal.style.display = 'none'; }
        };

        window.clearDriverSignatureCanvas = function() {
            if (!confirm("Möchten Sie die Zeichnung der Unterschrift wirklich zurücksetzen?")) return;
            if (driverSignatureCtx && driverSignatureCanvas) {
                driverSignatureCtx.fillStyle = '#ffffff';
                driverSignatureCtx.fillRect(0, 0, driverSignatureCanvas.width, driverSignatureCanvas.height);
            }
        };

        window.saveDriverSignatureCanvas = function() {
            if (!driverSignatureCanvas || !driverSigTarget) return;
            const dataUrl = window.signaturKlein(driverSignatureCanvas);
            if (typeof window.setDriverSignatureImage === 'function') {
                window.setDriverSignatureImage(driverSigTarget.templateId, driverSigTarget.index, dataUrl);
            }
            window.closeDriverSignaturePad();
        };
        // ─────────────────────────────────────────────────────────────────────

        // ── User Settings Signature Pad (eigene hinterlegte Unterschrift) ──────
        let userSignatureCanvas, userSignatureCtx, isUserSigDrawing = false;

        window.openUserSignaturePad = function() {
            const modal = document.getElementById('user-signature-modal');
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('show'));
            setTimeout(() => {
                userSignatureCanvas = document.getElementById('user-signature-canvas');
                if (userSignatureCanvas) {
                    userSignatureCanvas.width = userSignatureCanvas.offsetWidth || 560;
                    userSignatureCanvas.height = userSignatureCanvas.offsetHeight || 300;
                    userSignatureCtx = userSignatureCanvas.getContext('2d');
                    userSignatureCtx.strokeStyle = '#0f172a';
                    userSignatureCtx.lineWidth = 3;
                    userSignatureCtx.lineCap = 'round';
                    userSignatureCtx.lineJoin = 'round';
                    userSignatureCtx.fillStyle = '#ffffff';
                    userSignatureCtx.fillRect(0, 0, userSignatureCanvas.width, userSignatureCanvas.height);
                    const existingSig = document.getElementById('edit-user-signature').value;
                    if (existingSig && existingSig.startsWith('data:image')) {
                        const img = new Image();
                        img.onload = function() { userSignatureCtx.drawImage(img, 0, 0, userSignatureCanvas.width, userSignatureCanvas.height); };
                        img.src = existingSig;
                    }
                    const getPos = (e) => {
                        const rect = userSignatureCanvas.getBoundingClientRect();
                        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                        return { x: clientX - rect.left, y: clientY - rect.top };
                    };
                    const startDraw = (e) => { isUserSigDrawing = true; const p = getPos(e); userSignatureCtx.beginPath(); userSignatureCtx.moveTo(p.x, p.y); e.preventDefault(); };
                    const draw = (e) => { if (!isUserSigDrawing) return; const p = getPos(e); userSignatureCtx.lineTo(p.x, p.y); userSignatureCtx.stroke(); e.preventDefault(); };
                    const stopDraw = () => { isUserSigDrawing = false; };
                    userSignatureCanvas.onmousedown = startDraw;
                    userSignatureCanvas.onmousemove = draw;
                    userSignatureCanvas.onmouseup = stopDraw;
                    userSignatureCanvas.onmouseleave = stopDraw;
                    userSignatureCanvas.ontouchstart = startDraw;
                    userSignatureCanvas.ontouchmove = draw;
                    userSignatureCanvas.ontouchend = stopDraw;
                    userSignatureCanvas.ontouchcancel = stopDraw;
                }
            }, 50);
        };

        window.closeUserSignaturePad = function() {
            const modal = document.getElementById('user-signature-modal');
            if (modal) { modal.classList.remove('show'); modal.classList.add('hidden'); modal.style.display = 'none'; }
        };

        window.clearUserSignatureCanvas = function() {
            if (!confirm("Möchten Sie die Zeichnung der Unterschrift wirklich zurücksetzen?")) return;
            if (userSignatureCtx && userSignatureCanvas) {
                userSignatureCtx.fillStyle = '#ffffff';
                userSignatureCtx.fillRect(0, 0, userSignatureCanvas.width, userSignatureCanvas.height);
            }
        };

        window.saveUserSignatureCanvas = function() {
            if (userSignatureCanvas) {
                const dataUrl = window.signaturKlein(userSignatureCanvas);
                document.getElementById('edit-user-signature').value = dataUrl;
                const img = document.getElementById('user-signature-preview-img');
                if (img) { img.src = dataUrl; img.classList.remove('hidden'); img.style.display = 'block'; }
                const ph = document.getElementById('user-signature-placeholder');
                if (ph) ph.classList.add('hidden');
                const btn = document.getElementById('btn-clear-user-signature');
                if (btn) btn.classList.remove('hidden');
                window.closeUserSignaturePad();
            }
        };

        window.clearUserSignature = function() {
            if (!confirm("Möchten Sie die gespeicherte Unterschrift wirklich löschen?")) return;
            document.getElementById('edit-user-signature').value = '';
            const img = document.getElementById('user-signature-preview-img');
            if (img) { img.src = ''; img.classList.add('hidden'); img.style.display = 'none'; }
            const ph = document.getElementById('user-signature-placeholder');
            if (ph) ph.classList.remove('hidden');
            const btn = document.getElementById('btn-clear-user-signature');
            if (btn) btn.classList.add('hidden');
        };
        // ─────────────────────────────────────────────────────────────────────
