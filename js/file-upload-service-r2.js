/**
 * file-upload-service.js
 * Centralized service for file compression and parallel uploads.
 */

window.FileUploadService = {
    // Kleinbilder gar nicht erst neu berechnen: unter dieser Grenze kostet das
    // Umwandeln mehr Zeit, als es an Übertragung spart.
    COMPRESS_MIN_BYTES: 300 * 1024,

    // Der S3-Client wurde bisher für JEDE Datei neu gebaut — samt Prüfung, ob
    // das SDK schon geladen ist. Einmal reicht; er ist zustandslos.
    _r2: null,
    async _r2Client() {
        if (this._r2) return this._r2;
        await window.loadAWSSDK();
        this._r2 = new AWS.S3({
            endpoint: 'https://855feaccf4d0215922275100e91c4656.r2.cloudflarestorage.com',
            accessKeyId: '49a3cbad28594d9d5a90e46f3965133b',
            secretAccessKey: '0642e23714ce5c9f805d0c2f8f59e7c9df01ba8ba7a728b9640b0db5341de797',
            region: 'auto',
            signatureVersion: 'v4',
            // Wartet nicht endlos an einem hängenden Sockel, sondern versucht es neu.
            httpOptions: { timeout: 120000, connectTimeout: 10000 },
            maxRetries: 3
        });
        return this._r2;
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
                const s3 = await this._r2Client();

                const R2_BUCKET_NAME = window.R2_BUCKET_NAME || 'dateien';
                const R2_PUBLIC_URL = window.R2_PUBLIC_URL || 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev';

                console.log(`Uploading ${fileToUpload.name} to Cloudflare R2...`);

                const params = {
                    Bucket: R2_BUCKET_NAME,
                    Key: path,
                    Body: fileToUpload,
                    ContentType: fileToUpload.type
                };

                // putObject statt upload(): erzwingt einen einzelnen PUT-Request statt eines
                // mehrteiligen (multipart) Uploads bei größeren Dateien. Multipart braucht zusätzliche
                // CORS-Freigaben auf dem R2-Bucket, die dort fehlen können — das verursacht bei größeren
                // Dokumenten "blocked"/CORS-Fehler im Browser, während kleine Fotos unauffällig bleiben.
                await s3.putObject(params).promise();

                return {
                    url: `${R2_PUBLIC_URL}/${path}`,
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
     * Deletes a single file from the specified storage provider.
     * @param {string} path
     * @param {Object} options { bucket, provider }
     */
    async deleteFile(path, { bucket, provider = 'supabase' }) {
        if (!path) return;

        if (provider === 'cloudflare-r2') {
            try {
                const s3 = await this._r2Client();

                const R2_BUCKET_NAME = window.R2_BUCKET_NAME || 'dateien';

                console.log(`Deleting ${path} from Cloudflare R2...`);

                const params = {
                    Bucket: R2_BUCKET_NAME,
                    Key: path
                };

                await s3.deleteObject(params).promise();
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
                const s3 = await this._r2Client();

                const R2_BUCKET_NAME = window.R2_BUCKET_NAME || 'dateien';

                console.log(`Renaming (Copy + Delete) from ${oldPath} to ${newPath} in R2...`);

                // 1. Copy file
                await s3.copyObject({
                    Bucket: R2_BUCKET_NAME,
                    CopySource: encodeURIComponent(`${R2_BUCKET_NAME}/${oldPath}`),
                    Key: newPath
                }).promise();

                // 2. Delete old file
                await s3.deleteObject({
                    Bucket: R2_BUCKET_NAME,
                    Key: oldPath
                }).promise();

                const R2_PUBLIC_URL = window.R2_PUBLIC_URL || 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev';
                return {
                    success: true,
                    url: `${R2_PUBLIC_URL}/${newPath}`,
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
