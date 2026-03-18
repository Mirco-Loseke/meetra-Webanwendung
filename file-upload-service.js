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
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: 'image/webp'
        };
        
        try {
            console.log(`Compressing ${file.name}...`);
            const compressedBlob = await imageCompression(file, options);
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
     * Uploads a single file to the specified storage provider.
     * @param {File} file 
     * @param {Object} options { bucket, path, compress, provider, folderPath }
     */
    async uploadFile(file, { bucket, path, compress = true, provider = 'supabase', folderPath = null }) {
        let fileToUpload = file;
        
        if (compress && file.type.startsWith('image/')) {
            fileToUpload = await this.compressImage(file);
        }

        // --- CENTRAL GOOGLE DRIVE PROVIDER (via Edge Function) ---
        if (provider === 'google-drive' || true) { // Default to true if you want everything in Drive
            try {
                const targetFolderPath = folderPath || `Meetra_Storage/${bucket || 'General'}`;
                
                const fd = new FormData();
                fd.append('file', fileToUpload);
                fd.append('folderPath', targetFolderPath);

                console.log(`Uploading ${fileToUpload.name} to Central Google Drive via Edge Function...`);
                
                const response = await fetch('https://rtnpyziwyaqrlfazxkyr.supabase.co/functions/v1/google-drive-upload', {
                    method: 'POST',
                    body: fd
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Edge Function Upload failed');
                }

                const driveFile = await response.json();

                return {
                    url: driveFile.webViewLink,
                    path: driveFile.id, 
                    size: driveFile.size,
                    type: driveFile.mimeType,
                    name: driveFile.name,
                    provider: 'google-drive'
                };
            } catch (err) {
                console.warn('Central Google Drive upload failed, falling back to Supabase:', err);
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
    async uploadFiles(files, pathGenerator, { bucket, compress = true, concurrency = 5 }) {
        const results = [];
        const queue = [...files.entries()];
        
        const workers = Array(Math.min(concurrency, files.length)).fill(null).map(async () => {
            while (queue.length > 0) {
                const [index, file] = queue.shift();
                const path = pathGenerator(file, index);
                const result = await this.uploadFile(file, { bucket, path, compress });
                results[index] = result;
            }
        });

        await Promise.all(workers);
        return results;
    }
};
