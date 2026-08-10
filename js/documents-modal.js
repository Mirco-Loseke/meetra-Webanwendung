// ==========================================================
// Dokumente einer Maschine: Modal und Download
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 7481-7559).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        window.openDocumentsModal = function (el) {
            const modal = document.getElementById('document-overview-modal');
            const list = document.getElementById('document-overview-list');
            if (!modal || !list || !el) return;

            let docs = [];
            const rawDocs = el.getAttribute('data-docs');
            if (rawDocs) {
                try {
                    docs = JSON.parse(decodeURIComponent(rawDocs));
                } catch (e) { console.error("Error parsing docs:", e); }
            }

            if (!docs || docs.length === 0) return;

            list.innerHTML = docs.map(doc => `
                <div class="doc-item" 
                     style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; transition: all 0.2s; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(255,255,255,0.4); flex-shrink: 0;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                        <span style="color: white; font-weight: 500; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${doc.name}">${doc.name}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        <button onclick="window.open('${doc.url}', '_blank')" 
                                title="Dokument in neuem Tab öffnen"
                                style="width: 36px; height: 36px; border-radius: 10px; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: #60a5fa; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='rgba(59,130,246,0.25)'; this.style.transform='scale(1.1)'"
                                onmouseout="this.style.background='rgba(59,130,246,0.15)'; this.style.transform='scale(1)'">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                        <button onclick="window.downloadDocFile('${doc.url}', '${doc.name.replace(/'/g, "\\'")}')"
                                title="Dokument herunterladen"
                                style="width: 36px; height: 36px; border-radius: 10px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #10b981; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='rgba(16,185,129,0.25)'; this.style.transform='scale(1.1)'"
                                onmouseout="this.style.background='rgba(16,185,129,0.15)'; this.style.transform='scale(1)'">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                    </div>
                </div>
            `).join('');

            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.classList.remove('hidden');
            requestAnimationFrame(() => modal.classList.add('show'));
            document.body.style.overflow = 'hidden';
        };

        window.downloadDocFile = async function (url, filename) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('Download fehlgeschlagen');
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename || 'Dokument';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
            } catch (err) {
                console.error('Download-Fehler:', err);
                // Fallback: open in new tab
                window.open(url, '_blank');
            }
        };

        window.closeDocumentsModal = function () {
            const modal = document.getElementById('document-overview-modal');
            if (modal) {
                modal.classList.add('hidden');
                setTimeout(() => {
                    modal.style.display = 'none';
                    document.body.style.overflow = '';
                }, 300);
            }
        };
