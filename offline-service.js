// offline-service.js — IndexedDB-based offline queue for service reports
(function () {
    'use strict';

    const DB_NAME = 'meetra_offline';
    const DB_VERSION = 1;
    const STORE_PENDING = 'pending_service';
    const STORE_CACHE   = 'service_cache';

    // Array fields: union-merged (new local items appended to server list)
    const ARRAY_MERGE = ['work_log', 'tasks', 'materials', 'technicians', 'contact_persons'];
    // Fields that must never overwrite the server (IDs, PDF artifacts)
    const SERVER_ONLY  = ['id', 'created_at', 'updated_at', 'pdf_url', 'pdf_path', 'pdf_created_at'];

    // ── IndexedDB ────────────────────────────────────────────────────
    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_PENDING)) {
                    const s = db.createObjectStore(STORE_PENDING, { keyPath: 'local_id', autoIncrement: true });
                    s.createIndex('machine_id', 'machine_id');
                }
                if (!db.objectStoreNames.contains(STORE_CACHE)) {
                    const c = db.createObjectStore(STORE_CACHE, { keyPath: 'id' });
                    c.createIndex('machine_id', 'machine_id');
                }
            };
            req.onsuccess  = (e) => resolve(e.target.result);
            req.onerror    = (e) => reject(e.target.error);
        });
    }

    function idbReq(store, method, ...args) {
        return new Promise((resolve, reject) => {
            const req = store[method](...args);
            req.onsuccess = () => resolve(req.result);
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    // ── Public API ───────────────────────────────────────────────────
    window.offlineService = {

        // Queue a create/update for later sync.
        // action   : 'insert' | 'update'
        // serverId : null (new) or existing DB id
        // baseline : snapshot of server data at the moment the user opened the form
        // data     : the full reportData object to save
        saveDraft: async function (action, serverId, baseline, data) {
            const db = await openDB();
            return idbReq(
                db.transaction(STORE_PENDING, 'readwrite').objectStore(STORE_PENDING),
                'add',
                {
                    action,
                    server_id:  serverId || null,
                    baseline:   baseline || null,
                    data,
                    machine_id: data.machine_id,
                    title:      data.title || 'Servicebericht',
                    offline_at: new Date().toISOString()
                }
            );
        },

        getDrafts: async function () {
            const db = await openDB();
            return idbReq(db.transaction(STORE_PENDING, 'readonly').objectStore(STORE_PENDING), 'getAll');
        },

        deleteDraft: async function (localId) {
            const db = await openDB();
            return idbReq(
                db.transaction(STORE_PENDING, 'readwrite').objectStore(STORE_PENDING),
                'delete', localId
            );
        },

        // Cache fetched service entries for offline reading
        cacheEntries: async function (entries) {
            if (!entries || !entries.length) return;
            const db  = await openDB();
            const tx  = db.transaction(STORE_CACHE, 'readwrite');
            const st  = tx.objectStore(STORE_CACHE);
            entries.forEach(e => st.put(e));
            return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error); });
        },

        getCachedEntries: async function (machineId) {
            const db = await openDB();
            return idbReq(
                db.transaction(STORE_CACHE, 'readonly').objectStore(STORE_CACHE).index('machine_id'),
                'getAll', Number(machineId)
            );
        },

        // 3-way merge: local changes win unless server also changed the same field.
        // For array fields: union (server list + new local items not in baseline).
        mergeReport: function (baseline, localData, serverData) {
            if (!baseline) return localData; // brand-new insert — nothing to merge

            const result = Object.assign({}, serverData);

            for (const key of Object.keys(localData)) {
                if (SERVER_ONLY.includes(key)) continue;

                const localVal  = localData[key];
                const baseVal   = baseline[key];
                const serverVal = serverData[key];

                const localChanged  = JSON.stringify(localVal)  !== JSON.stringify(baseVal);
                const serverChanged = JSON.stringify(serverVal) !== JSON.stringify(baseVal);

                if (ARRAY_MERGE.includes(key)) {
                    const srv  = Array.isArray(serverVal) ? serverVal : [];
                    const loc  = Array.isArray(localVal)  ? localVal  : [];
                    const base = Array.isArray(baseVal)   ? baseVal   : [];
                    // Items added locally since baseline
                    const newLocal = loc.filter(li =>
                        !base.some(bi => JSON.stringify(bi) === JSON.stringify(li))
                    );
                    result[key] = [...srv, ...newLocal];
                } else if (localChanged && !serverChanged) {
                    // Only local changed → take local
                    result[key] = localVal;
                }
                // server changed (or neither) → keep server value (already in result)
            }

            return result;
        },

        // Process all pending drafts after reconnect
        syncPending: async function () {
            const drafts  = await this.getDrafts();
            if (!drafts.length) return { synced: 0, errors: [] };

            const supabase = window.supabaseClient;
            if (!supabase) return { synced: 0, errors: [] };

            let synced = 0;
            const errors = [];

            for (const draft of drafts) {
                try {
                    if (draft.action === 'insert') {
                        const { data: inserted, error } = await supabase
                            .from('service_entries')
                            .insert([draft.data])
                            .select('id');
                        if (error) throw error;
                        await this.deleteDraft(draft.local_id);
                        synced++;
                        if (inserted && inserted[0]) {
                            await this.cacheEntries([{ ...draft.data, id: inserted[0].id }]);
                        }

                    } else if (draft.action === 'update' && draft.server_id) {
                        const { data: serverArr, error: fetchErr } = await supabase
                            .from('service_entries')
                            .select('*')
                            .eq('id', draft.server_id)
                            .single();
                        if (fetchErr) throw fetchErr;

                        const merged = this.mergeReport(draft.baseline, draft.data, serverArr);
                        // Never overwrite PDF fields that were generated server-side
                        SERVER_ONLY.forEach(k => { if (serverArr[k] != null) merged[k] = serverArr[k]; });

                        const { error: updErr } = await supabase
                            .from('service_entries')
                            .update(merged)
                            .eq('id', draft.server_id);
                        if (updErr) throw updErr;

                        await this.deleteDraft(draft.local_id);
                        synced++;
                        await this.cacheEntries([{ ...merged, id: draft.server_id }]);
                    }
                } catch (err) {
                    console.error('[offlineService] Sync error for draft', draft.local_id, err);
                    errors.push({ draft, err });
                }
            }

            return { synced, errors };
        },

        countPending: async function () {
            return (await this.getDrafts()).length;
        }
    };

    // ── UI helpers ───────────────────────────────────────────────────
    function updateOfflineBanner() {
        const banner = document.getElementById('offline-status-banner');
        if (!banner) return;
        banner.style.display = navigator.onLine ? 'none' : 'flex';
    }

    window.showSyncToast = function (message, type) {
        type = type || 'info';
        let toast = document.getElementById('offline-sync-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'offline-sync-toast';
            toast.style.cssText = [
                'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
                'padding:10px 20px', 'border-radius:12px', 'font-size:0.88rem', 'font-weight:600',
                'color:#fff', 'z-index:999999', 'transition:opacity 0.4s',
                'box-shadow:0 4px 20px rgba(0,0,0,0.4)', 'display:flex',
                'align-items:center', 'gap:8px', 'white-space:nowrap'
            ].join(';');
            document.body.appendChild(toast);
        }
        const BG = { syncing: '#3b82f6', success: '#10b981', error: '#ef4444', info: '#6b7280' };
        const ICON = {
            syncing: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>',
            success: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            info:    ''
        };
        toast.style.background = BG[type] || BG.info;
        toast.style.opacity = '1';
        toast.innerHTML = (ICON[type] || '') + message;
        clearTimeout(toast._t);
        if (type !== 'syncing') {
            toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 4500);
        }
    };

    window.updatePendingBadge = async function () {
        const count  = await window.offlineService.countPending();
        const badge  = document.getElementById('offline-pending-badge');
        if (!badge) return;
        badge.textContent    = count || '';
        badge.style.display  = count > 0 ? 'inline-flex' : 'none';
    };

    async function onBackOnline() {
        updateOfflineBanner();
        const drafts = await window.offlineService.getDrafts();
        if (!drafts.length) return;

        window.showSyncToast(
            `${drafts.length} Servicebericht${drafts.length > 1 ? 'e' : ''} werden synchronisiert…`,
            'syncing'
        );

        try {
            const result = await window.offlineService.syncPending();
            if (result.synced > 0) {
                window.showSyncToast(
                    `${result.synced} Servicebericht${result.synced > 1 ? 'e' : ''} erfolgreich synchronisiert.`,
                    'success'
                );
            }
            if (result.errors && result.errors.length) {
                window.showSyncToast(`${result.errors.length} Fehler beim Synchronisieren.`, 'error');
            }
        } catch (e) {
            window.showSyncToast('Fehler beim Synchronisieren.', 'error');
        }
        window.updatePendingBadge();
    }

    window.addEventListener('online',  onBackOnline);
    window.addEventListener('offline', updateOfflineBanner);

    document.addEventListener('DOMContentLoaded', () => {
        updateOfflineBanner();
        window.updatePendingBadge();
    });
})();
