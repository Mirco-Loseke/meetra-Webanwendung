/**
 * file-upload-service.js
 * Centralized service for file compression and parallel uploads.
 */

window.FileUploadService = {
    // Kleinbilder gar nicht erst neu berechnen: unter dieser Grenze kostet das
    // Umwandeln mehr Zeit, als es an Übertragung spart.
    COMPRESS_MIN_BYTES: 300 * 1024,

    // Kein Schlüssel im Browser: jede R2-Aktion holt sich bei der Supabase Edge
    // Function `r2-sign` (supabase/functions/r2-sign/index.ts) eine 5 Minuten
    // gültige, signierte URL bzw. lässt sie serverseitig ausführen. Die Function
    // prüft die Anmeldung (JWT). Ausrollen: supabase/SETUP.txt.
    async r2Sign(payload) {
        const basis = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) || '';
        if (!basis) throw new Error('Verbindung zu Supabase fehlt.');
        if (!window.supabaseClient) throw new Error('Nicht angemeldet.');
        // Token holen; läuft es in weniger als 60 s ab oder lehnt die Function es ab
        // (Tab lag lange im Hintergrund, Auto-Refresh verpasst), einmal erneuern.
        const tokenHolen = async (erneuern) => {
            try {
                if (erneuern) { const { data } = await window.supabaseClient.auth.refreshSession(); return data && data.session ? data.session.access_token : ''; }
                const { data } = await window.supabaseClient.auth.getSession();
                const s = data && data.session;
                if (s && s.expires_at && s.expires_at * 1000 - Date.now() < 60000) return tokenHolen(true);
                return s ? s.access_token : '';
            } catch (e) { return ''; }
        };
        const senden = async (token) => {
            try {
                return await fetch(basis.replace(/\/+$/, '') + '/functions/v1/r2-sign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify(payload)
                });
            } catch (e) {
                const f = new Error('Upload-Freigabe (r2-sign) nicht erreichbar: ' + e.message);
                f.schritt = 'Freigabe holen'; f.netz = true; f.roh = e;
                throw f;
            }
        };
        let token = await tokenHolen(false);
        if (!token) throw new Error('Deine Anmeldung ist abgelaufen — bitte neu anmelden.');
        let res = await senden(token);
        if (res.status === 401) {
            token = await tokenHolen(true);
            if (!token) throw new Error('Deine Anmeldung ist abgelaufen — bitte neu anmelden.');
            res = await senden(token);
        }
        let daten = null;
        try { daten = await res.json(); } catch (e) { /* kein JSON */ }
        if (!res.ok) {
            const msg = (daten && daten.error) || ('HTTP ' + res.status);
            throw new Error(res.status === 404 ? 'Edge Function r2-sign ist nicht ausgerollt (supabase/SETUP.txt).' : 'Dateidienst: ' + msg);
        }
        return daten || {};
    },

    // Fehlerbericht: WELCHER Schritt, WARUM, unter welchen Bedingungen —
    // damit eine Meldung vom Handy reicht, um die Ursache einzugrenzen.
    // Der letzte Bericht liegt zusätzlich in localStorage['meetra_upload_fehler'].
    _fehlerBericht({ schritt, fehler, datei, versuch, versuche, status }) {
        const roh = (fehler && fehler.roh) || fehler || {};
        const rohText = [roh.name, roh.message].filter(Boolean).join(': ') || String(fehler || '');
        const netz = !!(fehler && fehler.netz) || /failed to fetch|network|load failed|abort/i.test(rohText);
        const online = typeof navigator.onLine === 'boolean' ? navigator.onLine : null;
        const c = navigator.connection || {};

        let ursache;
        if (status) ursache = `Server antwortet mit HTTP ${status}` + (status === 403 ? ' (Freigabe ungültig/abgelaufen oder CORS)' : status === 413 ? ' (Datei zu groß)' : status >= 500 ? ' (Störung beim Speicher)' : '');
        else if (fehler && fehler.zeit) ursache = fehler.message;
        else if (online === false) ursache = 'Handy ist offline (keine Internetverbindung)';
        else if (netz) ursache = 'Verbindung während der Übertragung abgebrochen oder vom Browser blockiert';
        else ursache = (fehler && fehler.message) || rohText;

        const mb = datei && datei.size != null ? (datei.size / 1048576).toFixed(2).replace('.', ',') + ' MB' : '?';
        const ua = navigator.userAgent || '';
        const browser = (ua.match(/(SamsungBrowser|Edg|Firefox|OPR|Chrome|Version)\/[\d.]+/) || [''])[0].replace('Version', 'Safari');
        const system = (ua.match(/Android [\d.]+|iPhone OS [\d_]+|Windows NT [\d.]+|Mac OS X [\d_]+/) || ['?'])[0];
        const netzInfo = [
            online === false ? 'offline' : 'online',
            c.effectiveType ? 'Netz ' + c.effectiveType : '',
            c.downlink ? c.downlink + ' Mbit/s' : '',
            c.rtt ? 'Ping ' + c.rtt + ' ms' : '',
            c.saveData ? 'Datensparmodus AN' : ''
        ].filter(Boolean).join(', ');

        const zeilen = [
            `Hochladen fehlgeschlagen beim Schritt „${schritt}"` + (versuche ? ` (Versuch ${versuch}/${versuche})` : ''),
            `Ursache: ${ursache}`,
            `Datei: ${(datei && datei.name) || '?'} · ${mb} · ${(datei && datei.type) || 'ohne Typ'}`,
            `Verbindung: ${netzInfo}`,
            `Gerät: ${system} · ${browser || '?'} · Tab ${document.hidden ? 'im Hintergrund' : 'sichtbar'}`,
            `Technisch: ${rohText}`,
            `Zeit: ${new Date().toLocaleString('de-DE')}`
        ];
        const text = zeilen.join('\n');
        try { localStorage.setItem('meetra_upload_fehler', text); } catch (e) { /* egal */ }
        console.error(text, fehler);
        this._fehlerZeigen(text);
        const err = new Error(text);
        err.bericht = text;
        return err;
    },

    // Bericht sichtbar machen — unabhängig davon, wie der Aufrufer den Fehler
    // anzeigt (manche kürzen auf einen Toast). Mehrere Fehler kurz
    // hintereinander (paralleles Hochladen) landen im selben Fenster.
    _fehlerZeigen(text) {
        let box = document.getElementById('upload-fehler-bericht');
        if (!box) {
            box = document.createElement('div');
            box.id = 'upload-fehler-bericht';
            box.style.cssText = 'position:fixed;inset:0;z-index:100050;background:rgba(2,6,23,0.75);display:flex;align-items:center;justify-content:center;padding:16px;';
            box.innerHTML = `
                <div style="background:#0f172a;border:1px solid rgba(239,68,68,0.5);border-radius:14px;max-width:560px;width:100%;max-height:85vh;display:flex;flex-direction:column;color:#fff;box-shadow:0 24px 60px rgba(0,0,0,0.6);">
                    <div style="padding:14px 16px;font-weight:800;border-bottom:1px solid rgba(255,255,255,0.1);">⚠️ Hochladen fehlgeschlagen</div>
                    <pre class="ufb-text" style="margin:0;padding:14px 16px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:0.8rem;line-height:1.45;color:rgba(255,255,255,0.85);"></pre>
                    <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid rgba(255,255,255,0.1);">
                        <button type="button" class="ufb-kopie" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;">Bericht kopieren</button>
                        <button type="button" class="ufb-zu" style="background:#ef4444;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:800;cursor:pointer;">Schließen</button>
                    </div>
                </div>`;
            box.querySelector('.ufb-zu').onclick = () => box.remove();
            box.querySelector('.ufb-kopie').onclick = async () => {
                const t = box.querySelector('.ufb-text').textContent;
                try { await navigator.clipboard.writeText(t); if (window.showToast) window.showToast('Bericht kopiert.'); }
                catch (e) { if (window.showToast) window.showToast('Kopieren nicht möglich – bitte Bildschirmfoto machen.'); }
            };
            document.body.appendChild(box);
        }
        const pre = box.querySelector('.ufb-text');
        pre.textContent = pre.textContent ? pre.textContent + '\n\n────────\n\n' + text : text;
    },

    // Alle Schlüssel unter einem Präfix (z. B. 'vorgaenge/<id>/').
    async listFiles(prefix) {
        const d = await this.r2Sign({ action: 'list', prefix: prefix || '' });
        return d.keys || [];
    },

    // Zielmaße wie bisher — nur der Weg dorthin ist ein anderer.
    MAX_EDGE: 1600,
    WEBP_QUALITY: 0.75,

    /**
     * Ein Bild in einem Durchgang verkleinern und als WebP kodieren.
     * Der bisherige Weg über imageCompression() suchte die Dateigröße iterativ
     * (bis zu 12 Kodierdurchläufe je Bild) — das war der mit Abstand größte
     * Zeitfresser beim Hochladen. createImageBitmap dekodiert außerhalb des
     * Hauptstrangs, OffscreenCanvas kodiert einmal. Gibt null zurück, wenn der
     * Browser das nicht kann; dann greift der alte Weg als Rückfall.
     * imageOrientation:'from-image' ist Pflicht — sonst liegen Handyfotos quer.
     */
    async _schnellKomprimieren(file) {
        if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') return null;
        let bitmap = null;
        try {
            bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            const scale = Math.min(1, this.MAX_EDGE / Math.max(bitmap.width, bitmap.height));
            const w = Math.max(1, Math.round(bitmap.width * scale));
            const h = Math.max(1, Math.round(bitmap.height * scale));

            const canvas = new OffscreenCanvas(w, h);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, w, h);

            const blob = await canvas.convertToBlob({ type: 'image/webp', quality: this.WEBP_QUALITY });
            if (!blob || !blob.type || blob.type.indexOf('webp') === -1) return null; // WebP nicht unterstützt
            return blob;
        } catch (e) {
            return null;
        } finally {
            if (bitmap && bitmap.close) bitmap.close();
        }
    },

    /**
     * Compresses an image file and converts it to WebP.
     * @param {File} file
     * @returns {Promise<File|Blob>}
     */
    async compressImage(file) {
        if (!file.type.startsWith('image/')) return file;
        // Schon klein genug — unverändert lassen.
        if (file.size <= this.COMPRESS_MIN_BYTES) return file;

        const options = {
            // Die Größenvorgabe absichtlich hoch: browser-image-compression
            // kodiert sonst mehrfach, bis der Wert unterschritten ist. Maß und
            // Qualität unten drücken die Datei ohnehin weit unter 1 MB.
            maxSizeMB: 100,
            maxWidthOrHeight: this.MAX_EDGE,
            useWebWorker: true,
            fileType: 'image/webp',
            initialQuality: this.WEBP_QUALITY,
            maxIteration: 1
        };

        try {
            console.log(`Compressing ${file.name}...`);
            const compressedBlob = (await this._schnellKomprimieren(file))
                || await imageCompression(file, options);

            // iPhone-Fotos liegen oft als HEIC vor, das deutlich effizienter komprimiert als WebP —
            // nach der Umwandlung kann die Datei dadurch trotz "Komprimierung" größer werden.
            // In diesem Fall lieber das Original behalten statt eine größere Datei hochzuladen.
            if (compressedBlob.size >= file.size) {
                console.warn(`Komprimiert wäre größer (${(compressedBlob.size/1024).toFixed(0)}KB) als Original (${(file.size/1024).toFixed(0)}KB) — Original wird verwendet.`);
                return file;
            }

            return new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                type: 'image/webp',
                lastModified: Date.now()
            });
        } catch (error) {
            console.error('Compression failed, using original file:', error);
            return file;
        }
    },

    /**
     * Generates a small thumbnail version of an image using Canvas.
     * @param {File} file - The original image file
     * @param {number} maxSize - Maximum width/height in pixels (default: 400)
     * @returns {Promise<File|null>} - The thumbnail File or null on failure
     */
    async generateThumbnail(file, maxSize = 400) {
        if (!file || !file.type || !file.type.startsWith('image/')) return null;

        // Schneller Weg: createImageBitmap dekodiert außerhalb des Hauptstrangs
        // und kann dabei gleich verkleinern — das Bild muss nicht erst über ein
        // <img>-Element und die Objekt-URL laufen. Klappt das nicht, greift der
        // bisherige Weg darunter unverändert.
        if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined') {
            let bitmap = null;
            try {
                bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
                const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
                const w = Math.max(1, Math.round(bitmap.width * scale));
                const h = Math.max(1, Math.round(bitmap.height * scale));
                const canvas = new OffscreenCanvas(w, h);
                canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
                const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 });
                if (blob && blob.type && blob.type.indexOf('webp') !== -1) {
                    return new File([blob], file.name.replace(/\.[^/.]+$/, '') + '_thumb.webp', {
                        type: 'image/webp', lastModified: Date.now()
                    });
                }
            } catch (e) {
                // weiter mit dem Weg darunter
            } finally {
                if (bitmap && bitmap.close) bitmap.close();
            }
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Scale down proportionally
                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round(height * maxSize / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round(width * maxSize / height);
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(blob => {
                    if (blob) {
                        const baseName = file.name.replace(/\.[^/.]+$/, '');
                        const thumbFile = new File(
                            [blob],
                            baseName + '_thumb.webp',
                            { type: 'image/webp', lastModified: Date.now() }
                        );
                        console.log(`Thumbnail generated: ${thumbFile.name} (${(thumbFile.size / 1024).toFixed(1)} KB)`);
                        resolve(thumbFile);
                    } else {
                        reject(new Error('Thumbnail blob generation failed'));
                    }
                }, 'image/webp', 0.7);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                console.warn('Failed to load image for thumbnail generation');
                resolve(null); // Don't break the upload flow
            };

            img.src = url;
        });
    },

    /**
     * Uploads a single file to the specified storage provider.
     * @param {File} file
     * @param {Object} options { bucket, path, compress, provider, folderPath }
     */
    async uploadFile(file, { bucket, path, compress = true, provider = 'supabase', folderPath = null }) {
        let fileToUpload = file;

        if (compress && file.type.startsWith('image/')) {
            fileToUpload = await this.compressImage(file);
        }

        // --- CLOUDFLARE R2 PROVIDER ---
        if (provider === 'cloudflare-r2') {
            try {
                console.log(`Uploading ${fileToUpload.name} to Cloudflare R2...`);
                const typ = fileToUpload.type || 'application/octet-stream';
                // Ein einzelner PUT (kein Multipart) — der Bucket braucht dafür nur PUT in den CORS-Regeln.
                // Mobilfunk bricht einzelne Anfragen gern kurz ab (Zellwechsel,
                // Energiesparen) — der Browser meldet dann nur "network failure".
                // Deshalb bis zu 4 Versuche, jeweils mit frisch signierter URL.
                const VERSUCHE = 4;
                let publicUrl = null;
                let letzter = null;   // { schritt, fehler, status }
                let v = 1;
                for (; v <= VERSUCHE; v++) {
                    let signiert;
                    try {
                        signiert = await this.r2Sign({ action: 'upload', path, contentType: typ });
                    } catch (e) {
                        letzter = { schritt: e.schritt || 'Freigabe holen', fehler: e };
                        if (/abgelaufen|nicht ausgerollt|Nicht angemeldet/.test(e.message || '')) break;
                        if (v < VERSUCHE) { await new Promise(r => setTimeout(r, 1000 * v * v)); }
                        continue;
                    }
                    try {
                        // Zeitgrenze je Versuch, die wirklich abbricht: 30 s + 20 s je MB.
                        const abbruch = new AbortController();
                        const grenze = 30000 + Math.ceil((fileToUpload.size || 0) / 1048576) * 20000;
                        const uhr = setTimeout(() => abbruch.abort(), grenze);
                        let res;
                        try {
                            res = await fetch(signiert.uploadUrl, { method: 'PUT', headers: { 'Content-Type': typ }, body: fileToUpload, signal: abbruch.signal });
                        } catch (e) {
                            if (e && e.name === 'AbortError') {
                                const z = new Error(`Keine Antwort nach ${Math.round(grenze / 1000)} s – Übertragung abgebrochen (Verbindung zu langsam oder hängt)`);
                                z.roh = e; z.netz = true; z.zeit = true;
                                throw z;
                            }
                            throw e;
                        } finally { clearTimeout(uhr); }
                        if (res.ok) { publicUrl = signiert.publicUrl; break; }
                        letzter = { schritt: 'Datei zum Speicher übertragen', fehler: new Error('HTTP ' + res.status), status: res.status };
                        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
                    } catch (e) {
                        letzter = { schritt: 'Datei zum Speicher übertragen', fehler: e };
                    }
                    if (v < VERSUCHE) {
                        console.warn(`Upload ${fileToUpload.name}: Versuch ${v} fehlgeschlagen (${letzter.schritt}: ${letzter.fehler && letzter.fehler.message}), neuer Versuch …`);
                        await new Promise(r => setTimeout(r, 1000 * v * v));
                    }
                }
                if (!publicUrl) {
                    throw this._fehlerBericht(Object.assign({ datei: fileToUpload, versuch: Math.min(v, VERSUCHE), versuche: VERSUCHE },
                        letzter || { schritt: 'unbekannt', fehler: new Error('unbekannter Fehler') }));
                }

                return {
                    url: publicUrl,
                    path: path,
                    size: fileToUpload.size,
                    type: fileToUpload.type,
                    name: fileToUpload.name,
                    provider: 'cloudflare-r2'
                };
            } catch (err) {
                console.error('Cloudflare R2 upload failed:', err);
                throw err;
            }
        }



        // --- SUPABASE PROVIDER (Standard / Fallback) ---
        const { data, error } = await window.supabaseClient.storage
            .from(bucket || 'meetra-storage')
            .upload(path, fileToUpload, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = window.supabaseClient.storage
            .from(bucket || 'meetra-storage')
            .getPublicUrl(path);

        return {
            url: publicUrl,
            path: path,
            size: fileToUpload.size,
            type: fileToUpload.type,
            name: fileToUpload.name,
            provider: 'supabase'
        };
    },

    /**
     * Uploads multiple files in parallel with a concurrency limit.
     * @param {File[]} files
     * @param {Function} pathGenerator (file, index) => string
     * @param {Object} options { bucket, compress, concurrency }
     */
    async uploadFiles(files, pathGenerator, { bucket, compress = true, concurrency = 8, provider = 'supabase', onUploaded = null }) {
        const list = Array.from(files || []);
        if (!list.length) return [];
        const results = [];

        // Zweistufig statt nacheinander: Rechnen und Übertragen sind
        // verschiedene Engpässe. Vorher machte jeder Arbeiter
        // komprimieren → hochladen → komprimieren → …, wodurch die Leitung
        // während des Rechnens brachlag und umgekehrt. Jetzt läuft die
        // Komprimierung mit eigener Begrenzung voraus (so viele gleichzeitig,
        // wie der Rechner Kerne hat), die Übertragung holt sie einzeln ab.
        const cpu = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
        const vorbereitet = new Array(list.length);
        let naechsterZumRechnen = 0;

        function rechnerFrei(service) {
            if (naechsterZumRechnen >= list.length) return null;
            const i = naechsterZumRechnen++;
            const file = list[i];
            const p = (compress && file.type && file.type.startsWith('image/'))
                ? service.compressImage(file).catch(() => file)
                : Promise.resolve(file);
            vorbereitet[i] = p;
            // Sobald einer fertig ist, den nächsten anstoßen — so sind nie mehr
            // als `cpu` Bilder gleichzeitig im Speicher entpackt.
            p.then(() => rechnerFrei(service), () => rechnerFrei(service));
            return p;
        }
        for (let k = 0; k < Math.min(cpu, list.length); k++) rechnerFrei(this);

        // Handy: 8 parallele Übertragungen überfordern Mobilfunk und Browser
        // (Abbrüche mit "network failure"). Dort höchstens 3 gleichzeitig.
        const mobil = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '')
            || (navigator.connection && navigator.connection.type === 'cellular');
        if (mobil) concurrency = Math.min(concurrency, 3);

        let naechsterZumSenden = 0;
        const sender = Array(Math.min(concurrency, list.length)).fill(null).map(async () => {
            while (naechsterZumSenden < list.length) {
                const index = naechsterZumSenden++;
                // Pfad weiterhin aus der Originaldatei — die Module leiten die
                // Dateiendung daraus ab.
                const path = pathGenerator(list[index], index);
                // Wurde dieser Eintrag noch nicht angestoßen (mehr Sender als
                // Rechner), dann jetzt.
                while (!vorbereitet[index]) rechnerFrei(this);
                const fertig = await vorbereitet[index];
                vorbereitet[index] = null; // Speicher freigeben
                results[index] = await this.uploadFile(fertig, {
                    bucket, path, compress: false, provider
                });
                // Nacharbeit (z. B. Vorschaubild) gleich hier statt in einem
                // zweiten Durchgang — sie läuft dann neben den übrigen
                // Übertragungen und bekommt die bereits verkleinerte Datei.
                if (onUploaded) await onUploaded(index, results[index], fertig);
            }
        });

        await Promise.all(sender);
        return results;
    },

    /**
     * Eine Datei aus R2 als Blob zurueckholen — ueber DENSELBEN Weg, ueber
     * den sie hochgeladen wurde (signierte S3-Anfrage an
     * ...r2.cloudflarestorage.com).
     *
     * Warum das noetig ist: die oeffentliche Adresse (pub-....r2.dev) ist ein
     * anderer Host, und der schickt keine CORS-Kopfzeilen. Ein `fetch` oder
     * ein <img crossOrigin> darauf scheitert deshalb, und ohne Pixelzugriff
     * laesst sich kein PDF bauen ("Tainted canvas"). Der S3-Endpunkt dagegen
     * beantwortet Anfragen aus dem Browser — sonst koennte diese App dorthin
     * gar nicht erst hochladen.
     *
     * @param {string} path Schluessel im Bucket, z. B. "Maschinen/x/foto.jpg"
     * @returns {Promise<Blob>}
     */
    async downloadFile(path, { bucket } = {}) {
        if (!path) throw new Error('Kein Pfad angegeben.');
        const { downloadUrl } = await this.r2Sign({ action: 'download', path });
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error('Datei konnte nicht geladen werden (HTTP ' + res.status + ').');
        return await res.blob();
    },

    /**
     * Aus einer oeffentlichen R2-Adresse den Schluessel im Bucket gewinnen.
     * Gibt null zurueck, wenn die Adresse nicht zu unserem Bucket gehoert.
     */
    r2PfadAusUrl(url) {
        try {
            const oeffentlich = window.R2_PUBLIC_URL || 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev';
            const u = new URL(url, location.href);
            if (u.origin !== new URL(oeffentlich).origin) return null;
            return decodeURIComponent(u.pathname.replace(/^\//, ''));
        } catch (e) {
            return null;
        }
    },

    /**
     * Deletes a single file from the specified storage provider.
     * @param {string} path
     * @param {Object} options { bucket, provider }
     */
    async deleteFile(path, { bucket, provider = 'supabase' }) {
        if (!path) return;

        if (provider === 'cloudflare-r2') {
            try {
                console.log(`Deleting ${path} from Cloudflare R2...`);
                const { deleteUrl } = await this.r2Sign({ action: 'delete', path });
                const res = await fetch(deleteUrl, { method: 'DELETE' });
                if (!res.ok && res.status !== 404) throw new Error('R2 hat das Löschen abgelehnt (HTTP ' + res.status + ').');
                return { success: true, provider: 'cloudflare-r2' };
            } catch (err) {
                console.error('Cloudflare R2 deletion failed:', err);
                throw err;
            }
        }

        // Supabase Provider Fallback
        const { data, error } = await window.supabaseClient.storage
            .from(bucket || 'meetra-storage')
            .remove([path]);

        if (error) throw error;
        return { success: true, provider: 'supabase' };
    },

    /**
     * Renames a single file by copying it to the new path and deleting the old one.
     * @param {string} oldPath
     * @param {string} newPath
     * @param {Object} options { bucket, provider }
     */
    async renameFile(oldPath, newPath, { bucket, provider = 'supabase' }) {
        if (!oldPath || !newPath || oldPath === newPath) return { success: true };

        if (provider === 'cloudflare-r2') {
            try {
                console.log(`Renaming (Copy + Delete) from ${oldPath} to ${newPath} in R2...`);
                // Kopieren + Löschen macht die Edge Function serverseitig.
                const d = await this.r2Sign({ action: 'rename', fromPath: oldPath, toPath: newPath });
                const R2_PUBLIC_URL = window.R2_PUBLIC_URL || 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev';
                return {
                    success: true,
                    url: d.publicUrl || `${R2_PUBLIC_URL}/${newPath}`,
                    path: newPath,
                    provider: 'cloudflare-r2'
                };
            } catch (err) {
                console.error('Cloudflare R2 rename failed:', err);
                throw err;
            }
        }

        // Supabase Rename (Copy + Remove)
        try {
            const b = bucket || 'meetra-storage';
            const { error: copyError } = await window.supabaseClient.storage
                .from(b)
                .copy(oldPath, newPath);

            if (copyError) throw copyError;

            const { error: removeError } = await window.supabaseClient.storage
                .from(b)
                .remove([oldPath]);

            if (removeError) throw removeError;

            const { data: { publicUrl } } = window.supabaseClient.storage
                .from(b)
                .getPublicUrl(newPath);

            return {
                success: true,
                url: publicUrl,
                path: newPath,
                provider: 'supabase'
            };
        } catch (err) {
            console.error('Supabase rename failed:', err);
            throw err;
        }
    }
};
