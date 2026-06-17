/**
 * file-upload-service-r2.js
 * Credentials-free upload service — all signing happens in the Supabase Edge Function r2-sign.
 */

const R2_SIGN_URL = 'https://rtnpyziwyaqrlfazxkyr.supabase.co/functions/v1/r2-sign';

async function r2Sign(payload) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Nicht eingeloggt');

    const res = await fetch(R2_SIGN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'R2 sign error');
    return data;
}

window.FileUploadService = {

    async compressImage(file) {
        if (!file.type.startsWith('image/')) return file;
        const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: 'image/webp',
        };
        try {
            const compressed = await imageCompression(file, options);
            return new File([compressed], file.name.replace(/\.[^/.]+$/, '') + '.webp', {
                type: 'image/webp',
                lastModified: Date.now(),
            });
        } catch {
            return file;
        }
    },

    async generateThumbnail(file, maxSize = 400) {
        if (!file || !file.type || !file.type.startsWith('image/')) return null;

        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
                else        { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '_thumb.webp', {
                            type: 'image/webp', lastModified: Date.now(),
                        }));
                    } else {
                        resolve(null);
                    }
                }, 'image/webp', 0.7);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    },

    async uploadFile(file, { bucket, path, compress = true, provider = 'supabase' }) {
        let fileToUpload = compress && file.type.startsWith('image/')
            ? await this.compressImage(file)
            : file;

        if (provider === 'cloudflare-r2') {
            const { uploadUrl, publicUrl } = await r2Sign({
                action: 'upload',
                path,
                contentType: fileToUpload.type || 'application/octet-stream',
            });

            const uploadRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': fileToUpload.type || 'application/octet-stream' },
                body: fileToUpload,
            });
            if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`);

            return { url: publicUrl, path, size: fileToUpload.size, type: fileToUpload.type, name: fileToUpload.name, provider: 'cloudflare-r2' };
        }

        // Supabase Storage fallback
        const { error } = await window.supabaseClient.storage
            .from(bucket || 'meetra-storage')
            .upload(path, fileToUpload, { cacheControl: '3600', upsert: true });
        if (error) throw error;

        const { data: { publicUrl } } = window.supabaseClient.storage
            .from(bucket || 'meetra-storage')
            .getPublicUrl(path);

        return { url: publicUrl, path, size: fileToUpload.size, type: fileToUpload.type, name: fileToUpload.name, provider: 'supabase' };
    },

    async uploadFiles(files, pathGenerator, { bucket, compress = true, concurrency = 5, provider = 'supabase' }) {
        const results = [];
        const queue = [...files.entries()];
        const workers = Array(Math.min(concurrency, files.length)).fill(null).map(async () => {
            while (queue.length > 0) {
                const [index, file] = queue.shift();
                results[index] = await this.uploadFile(file, { bucket, path: pathGenerator(file, index), compress, provider });
            }
        });
        await Promise.all(workers);
        return results;
    },

    async deleteFile(path, { bucket, provider = 'supabase' }) {
        if (!path) return;

        if (provider === 'cloudflare-r2') {
            const { deleteUrl } = await r2Sign({ action: 'delete', path });
            const res = await fetch(deleteUrl, { method: 'DELETE' });
            if (!res.ok) throw new Error(`R2 delete failed: ${res.status}`);
            return { success: true, provider: 'cloudflare-r2' };
        }

        const { error } = await window.supabaseClient.storage
            .from(bucket || 'meetra-storage')
            .remove([path]);
        if (error) throw error;
        return { success: true, provider: 'supabase' };
    },

    async renameFile(oldPath, newPath, { bucket, provider = 'supabase' }) {
        if (!oldPath || !newPath || oldPath === newPath) return { success: true };

        if (provider === 'cloudflare-r2') {
            const result = await r2Sign({ action: 'rename', fromPath: oldPath, toPath: newPath });
            return { success: true, url: result.publicUrl, path: newPath, provider: 'cloudflare-r2' };
        }

        const b = bucket || 'meetra-storage';
        const { error: copyErr } = await window.supabaseClient.storage.from(b).copy(oldPath, newPath);
        if (copyErr) throw copyErr;
        const { error: removeErr } = await window.supabaseClient.storage.from(b).remove([oldPath]);
        if (removeErr) throw removeErr;
        const { data: { publicUrl } } = window.supabaseClient.storage.from(b).getPublicUrl(newPath);
        return { success: true, url: publicUrl, path: newPath, provider: 'supabase' };
    },
};
