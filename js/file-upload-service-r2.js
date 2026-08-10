/**
 * file-upload-service.js
 * Centralized service for file compression and parallel uploads.
 */

window.FileUploadService = {
    /**
     * Compresses an image file and converts it to WebP.
     * @param {File} file
     * @returns {Promise<File|Blob>}
     */
    async compressImage(file) {
        if (!file.type.startsWith('image/')) return file;

        const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1600,
            useWebWorker: true,
            fileType: 'image/webp',
            initialQuality: 0.75,
            maxIteration: 12
        };

        try {
            console.log(`Compressing ${file.name}...`);
            const compressedBlob = await imageCompression(file, options);

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
                await window.loadAWSSDK();
                // Initialize AWS S3 Client for Cloudflare R2
                const s3 = new AWS.S3({
                    endpoint: 'https://855feaccf4d0215922275100e91c4656.r2.cloudflarestorage.com',
                    accessKeyId: '49a3cbad28594d9d5a90e46f3965133b',
                    secretAccessKey: '0642e23714ce5c9f805d0c2f8f59e7c9df01ba8ba7a728b9640b0db5341de797',
                    region: 'auto',
                    signatureVersion: 'v4'
                });

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
    async uploadFiles(files, pathGenerator, { bucket, compress = true, concurrency = 5, provider = 'supabase' }) {
        const results = [];
        const queue = [...files.entries()];

        const workers = Array(Math.min(concurrency, files.length)).fill(null).map(async () => {
            while (queue.length > 0) {
                const [index, file] = queue.shift();
                const path = pathGenerator(file, index);
                const result = await this.uploadFile(file, { bucket, path, compress, provider });
                results[index] = result;
            }
        });

        await Promise.all(workers);
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
                await window.loadAWSSDK();
                const s3 = new AWS.S3({
                    endpoint: 'https://855feaccf4d0215922275100e91c4656.r2.cloudflarestorage.com',
                    accessKeyId: '49a3cbad28594d9d5a90e46f3965133b',
                    secretAccessKey: '0642e23714ce5c9f805d0c2f8f59e7c9df01ba8ba7a728b9640b0db5341de797',
                    region: 'auto',
                    signatureVersion: 'v4'
                });

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
                await window.loadAWSSDK();
                const s3 = new AWS.S3({
                    endpoint: 'https://855feaccf4d0215922275100e91c4656.r2.cloudflarestorage.com',
                    accessKeyId: '49a3cbad28594d9d5a90e46f3965133b',
                    secretAccessKey: '0642e23714ce5c9f805d0c2f8f59e7c9df01ba8ba7a728b9640b0db5341de797',
                    region: 'auto',
                    signatureVersion: 'v4'
                });

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
