// offline-service.js — IndexedDB-based offline queue for service reports
(function () {
    'use strict';

    const DB_NAME = 'meetra_offline';
    const DB_VERSION = 3;
    const STORE_PENDING = 'pending_service';
    const STORE_CACHE   = 'service_cache';      // schlanke Listenfelder (wie online geladen)
    const STORE_FULL    = 'service_full_cache';  // vollständige Datensätze (alle Felder) fuer Offline-Bearbeitung
    const STORE_MACHINES = 'pending_machines';   // Maschinen-Bearbeitungen, offline gespeichert

    // Array fields: union-merged (new local items appended to server list)
    const ARRAY_MERGE = ['work_log', 'tasks', 'materials', 'technicians', 'contact_persons'];
    // Fields that must never overwrite the server (IDs, PDF artifacts)
    const SERVER_ONLY  = ['id', 'created_at', 'updated_at', 'pdf_url', 'pdf_path', 'pdf_created_at', 'is_finalized', 'finalized_at'];

    // Tatsächliche Spalten von service_entries — schützt vor "column not found"-Fehlern beim Sync,
    // falls ein alter/fehlerhafter lokaler Entwurf (z.B. aus einer früheren App-Version) noch
    // Felder enthält, die es in dieser Tabelle nicht gibt (z.B. location_* gehört zu "machines").
    const VALID_FIELDS = new Set([
        'id', 'machine_id', 'category_id', 'category_ids', 'title', 'date', 'datum_von', 'datum_bis',
        'hours', 'technicians', 'files', 'description', 'travel_distance_km', 'travel_time_minutes',
        'customer_signature', 'customer_name', 'tech_signature', 'operating_hours', 'workshop_order_number',
        'work_log', 'tasks', 'materials', 'checklist_payload', 'status_repaired', 'status_repaired_en',
        'tech_sig_date', 'customer_sig_date', 'contact_persons', 'hotel_company', 'hotel_street',
        'hotel_zip', 'hotel_city', 'hotel_country', 'created_at', 'updated_at',
        'pdf_url', 'pdf_path', 'pdf_created_at', 'locked_by', 'locked_at',
        'is_finalized', 'finalized_at'
    ]);

    function sanitizeForServiceEntries(obj) {
        const clean = {};
        for (const key of Object.keys(obj || {})) {
            if (VALID_FIELDS.has(key)) clean[key] = obj[key];
        }
        return clean;
    }

    // ── IndexedDB ────────────────────────────────────────────────────
    let cachedDB = null;

    // iOS Safari hat einen bekannten Fehler: nachdem die Seite im Hintergrund war
    // (z.B. weil man kurz zu den Einstellungen wechselt, um WLAN auszuschalten),
    // antwortet IndexedDB manchmal gar nicht mehr — weder Erfolg noch Fehler.
    // Deshalb JEDE IndexedDB-Operation mit einem Zeitlimit absichern, statt endlos zu warten.
    function withDBTimeout(promise, ms = 5000) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Offline-Speicher antwortet nicht (bekannter iOS-Fehler nach Hintergrund-Wechsel). Bitte die Seite einmal neu laden.')), ms))
        ]);
    }

    function openDBRaw() {
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
                if (!db.objectStoreNames.contains(STORE_FULL)) {
                    db.createObjectStore(STORE_FULL, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_MACHINES)) {
                    db.createObjectStore(STORE_MACHINES, { keyPath: 'local_id', autoIncrement: true });
                }
            };
            req.onsuccess = (e) => {
                const db = e.target.result;
                // Andere offene Verbindung (anderer Tab/Fenster) blockiert sonst künftige
                // Versions-Upgrades unbegrenzt — daher selbst schließen, sobald eine neuere
                // Version geöffnet werden will.
                db.onversionchange = () => { db.close(); cachedDB = null; };
                cachedDB = db;
                resolve(db);
            };
            req.onerror = (e) => reject(e.target.error);
            // Eine andere offene Verbindung mit alter Version blockiert das Upgrade —
            // ohne diesen Handler würde das Promise sonst für immer haengen bleiben.
            req.onblocked = () => reject(new Error('Offline-Speicher ist in einem anderen Tab/Fenster der App noch geöffnet. Bitte alle anderen Tabs/Fenster schließen und neu laden.'));
        });
    }

    function openDB() {
        if (cachedDB) return Promise.resolve(cachedDB);
        return withDBTimeout(openDBRaw()).catch(err => {
            cachedDB = null;
            throw err;
        });
    }

    // iOS Safari: nach Rückkehr aus dem Hintergrund (z.B. Wechsel zu den Einstellungen,
    // um WLAN umzuschalten) kann die bisherige IndexedDB-Verbindung "einfrieren" und nie
    // mehr antworten. Beim Sichtbarwerden vorsorglich verwerfen, damit der nächste Zugriff
    // eine frische Verbindung öffnet statt an der alten haengen zu bleiben.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && cachedDB) {
            try { cachedDB.close(); } catch (e) {}
            cachedDB = null;
        }
    });

    function idbReq(store, method, ...args) {
        return withDBTimeout(new Promise((resolve, reject) => {
            const req = store[method](...args);
            req.onsuccess = () => resolve(req.result);
            req.onerror   = (e) => reject(e.target.error);
        }));
    }

    // ── Public API ───────────────────────────────────────────────────
    window.offlineService = {

        // Queue a create/update for later sync.
        // action       : 'insert' | 'update'
        // serverId     : null (new) or existing DB id
        // baseline     : snapshot of server data at the moment the user opened the form
        // data         : the full reportData object to save
        // pendingFiles : File objects selected offline, not yet uploaded — IndexedDB can store
        //                File/Blob natively, upload happens once back online (see syncPending)
        // draftKey     : nur für action 'insert' — stabiler Client-Schlüssel, damit mehrfaches
        //                Speichern desselben noch nicht angelegten Berichts (während man offline
        //                bleibt) denselben Entwurf aktualisiert statt jedes Mal eine neue, separate
        //                Kopie anzulegen (die beim Sync sonst als mehrere doppelte Berichte landen würde).
        //
        // Speichert NIE einfach einen weiteren Entwurf an — sucht zuerst nach einem bereits
        // wartenden Entwurf für denselben Bericht (gleiche server_id bzw. gleicher draftKey) und
        // aktualisiert diesen stattdessen. Sonst würde jedes erneute Offline-Speichern denselben
        // Berichts einen weiteren Entwurf mit demselben, alten baseline-Stand anlegen — beim Sync
        // werden dann alle nacheinander gegen den (inzwischen veralteten) baseline-Stand gemerged,
        // was Listen-Felder wie Arbeitszeit/Material mehrfach dupliziert.
        saveDraft: async function (action, serverId, baseline, data, pendingFiles, draftKey) {
            const db = await openDB();
            const existing = (await idbReq(db.transaction(STORE_PENDING, 'readonly').objectStore(STORE_PENDING), 'getAll'))
                .find(d => d.action === action && (
                    (action === 'update' && serverId && d.server_id === serverId) ||
                    (action === 'insert' && draftKey && d.draft_key === draftKey)
                ));

            const newFiles = pendingFiles && pendingFiles.length ? pendingFiles : [];
            const record = {
                action,
                server_id:    serverId || null,
                draft_key:    action === 'insert' ? (draftKey || null) : null,
                // Baseline NIE überschreiben, falls schon ein Entwurf existiert — sie muss den
                // echten Server-Stand von VOR dem ersten Offline-Speichern dieser Sitzung behalten.
                baseline:     existing ? existing.baseline : (baseline || null),
                data,
                pending_files: existing ? [...existing.pending_files, ...newFiles] : newFiles,
                machine_id: data.machine_id,
                title:      data.title || 'Servicebericht',
                offline_at: new Date().toISOString()
            };

            if (existing) record.local_id = existing.local_id;

            return idbReq(
                db.transaction(STORE_PENDING, 'readwrite').objectStore(STORE_PENDING),
                existing ? 'put' : 'add',
                record
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

        // Cache fetched service entries for offline reading. Wird immer mit der KOMPLETTEN
        // aktuellen Liste vom Server aufgerufen — daher Store erst leeren statt nur put(), sonst
        // bleiben in der Zwischenzeit (z.B. von einem anderen Gerät) gelöschte Berichte als
        // "Geister-Einträge" für immer im Cache und tauchen beim nächsten Laden wieder auf.
        cacheEntries: async function (entries) {
            if (!entries) return;
            const db  = await openDB();
            const tx  = db.transaction(STORE_CACHE, 'readwrite');
            const st  = tx.objectStore(STORE_CACHE);
            st.clear();
            entries.forEach(e => st.put(e));
            return withDBTimeout(new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error); }));
        },

        getCachedEntries: async function (machineId) {
            const db = await openDB();
            return idbReq(
                db.transaction(STORE_CACHE, 'readonly').objectStore(STORE_CACHE).index('machine_id'),
                'getAll', Number(machineId)
            );
        },

        getAllCachedEntries: async function () {
            const db = await openDB();
            return idbReq(db.transaction(STORE_CACHE, 'readonly').objectStore(STORE_CACHE), 'getAll');
        },

        getCachedEntry: async function (id) {
            const db = await openDB();
            return idbReq(db.transaction(STORE_CACHE, 'readonly').objectStore(STORE_CACHE), 'get', Number(id));
        },

        // Vollständige Datensätze (alle Felder) — separat vom schlanken Listen-Cache,
        // damit Felder wie "description", die in der Liste absichtlich nicht geladen werden,
        // dort nicht versehentlich auftauchen.
        cacheFullEntries: async function (entries) {
            if (!entries || !entries.length) return;
            const db  = await openDB();
            const tx  = db.transaction(STORE_FULL, 'readwrite');
            const st  = tx.objectStore(STORE_FULL);
            entries.forEach(e => st.put(e));
            return withDBTimeout(new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error); }));
        },

        getCachedFullEntry: async function (id) {
            const db = await openDB();
            return idbReq(db.transaction(STORE_FULL, 'readonly').objectStore(STORE_FULL), 'get', Number(id));
        },

        // Entfernt einen gelöschten Bericht sofort aus beiden Caches (Liste + Volldaten),
        // statt auf den nächsten kompletten Re-Fetch zu warten.
        deleteCachedEntry: async function (id) {
            const db = await openDB();
            const numId = Number(id);
            await Promise.all([
                idbReq(db.transaction(STORE_CACHE, 'readwrite').objectStore(STORE_CACHE), 'delete', numId),
                idbReq(db.transaction(STORE_FULL, 'readwrite').objectStore(STORE_FULL), 'delete', numId)
            ]);
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
                    // Items added locally since baseline UND noch nicht auf dem Server vorhanden.
                    // Die srv-Prüfung ist entscheidend: Werden mehrere Offline-Entwürfe desselben
                    // Berichts nacheinander synchronisiert, hat der Server nach dem ersten Entwurf
                    // bereits die neuen Einträge — ohne diese Prüfung würden sie bei jedem weiteren
                    // Entwurf erneut als "neu" erkannt und dupliziert (basierend auf dem immer
                    // gleichen, alten baseline-Stand).
                    const newLocal = loc.filter(li =>
                        !base.some(bi => JSON.stringify(bi) === JSON.stringify(li)) &&
                        !srv.some(si => JSON.stringify(si) === JSON.stringify(li))
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

        // Uploads File objects that were attached while offline (stored as-is in IndexedDB)
        // and returns them in the same {name, type, url} shape the online upload path produces.
        uploadPendingFiles: async function (draft) {
            if (!draft.pending_files || !draft.pending_files.length) return [];
            if (!window.FileUploadService) return [];

            const machine = (window.machineList || []).find(m => String(m.id) === String(draft.machine_id));
            const folderName = (machine && window.getMachineFolderName)
                ? window.getMachineFolderName(machine.id, machine.manufacturer, machine.name, machine.serial || machine.serial_number, machine.year)
                : `Maschinen/${draft.machine_id}`;

            const pathGenerator = (file, i) => {
                const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                return `${folderName}/Serviceberichte/${Date.now()}-${i}-${cleanName}`;
            };

            const uploadResults = await window.FileUploadService.uploadFiles(
                draft.pending_files,
                pathGenerator,
                { bucket: 'dateien', compress: true, concurrency: 5, provider: 'cloudflare-r2' }
            );

            return uploadResults.map((result, i) => ({
                name: draft.pending_files[i].name,
                type: draft.pending_files[i].type,
                url: result.url
            }));
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
                    // Offline angehängte Fotos/Dokumente zuerst hochladen (jetzt online),
                    // bevor der Bericht selbst gespeichert wird.
                    const newFiles = await this.uploadPendingFiles(draft);

                    if (draft.action === 'insert') {
                        const insertPayload = sanitizeForServiceEntries(draft.data);
                        if (newFiles.length) insertPayload.files = [...(insertPayload.files || []), ...newFiles];

                        const { data: inserted, error } = await supabase
                            .from('service_entries')
                            .insert([insertPayload])
                            .select('id');
                        if (error) throw error;
                        await this.deleteDraft(draft.local_id);
                        synced++;
                        if (inserted && inserted[0]) {
                            await this.cacheFullEntries([{ ...insertPayload, id: inserted[0].id }]);
                        }

                    } else if (draft.action === 'update' && draft.server_id) {
                        const { data: serverArr, error: fetchErr } = await supabase
                            .from('service_entries')
                            .select('*')
                            .eq('id', draft.server_id)
                            .single();
                        if (fetchErr) throw fetchErr;

                        const merged = sanitizeForServiceEntries(this.mergeReport(draft.baseline, draft.data, serverArr));
                        if (newFiles.length) merged.files = [...(merged.files || []), ...newFiles];
                        // Never overwrite PDF fields that were generated server-side
                        SERVER_ONLY.forEach(k => { if (serverArr[k] != null) merged[k] = serverArr[k]; });

                        const { error: updErr } = await supabase
                            .from('service_entries')
                            .update(merged)
                            .eq('id', draft.server_id);
                        if (updErr) throw updErr;

                        await this.deleteDraft(draft.local_id);
                        synced++;
                        await this.cacheFullEntries([{ ...merged, id: draft.server_id }]);
                    }
                } catch (err) {
                    console.error('[offlineService] Sync error for draft', draft.local_id, err);
                    errors.push({ draft, err: err && (err.message || err.error_description || JSON.stringify(err)) });
                }
            }

            return { synced, errors };
        },

        countPending: async function () {
            return (await this.getDrafts()).length;
        },

        // ── Maschinen-Bearbeitungen offline (nur Bearbeiten bestehender Maschinen) ──────
        saveMachineDraft: async function (machineId, data, pendingFiles, removedFiles, manufacturer, name, serial, year) {
            const db = await openDB();
            return idbReq(
                db.transaction(STORE_MACHINES, 'readwrite').objectStore(STORE_MACHINES),
                'add',
                {
                    machine_id: machineId,
                    data,
                    pending_files: pendingFiles && pendingFiles.length ? pendingFiles : [],
                    removed_files: removedFiles && removedFiles.length ? removedFiles : [],
                    manufacturer, name, serial, year,
                    offline_at: new Date().toISOString()
                }
            );
        },

        getMachineDrafts: async function () {
            const db = await openDB();
            return idbReq(db.transaction(STORE_MACHINES, 'readonly').objectStore(STORE_MACHINES), 'getAll');
        },

        deleteMachineDraft: async function (localId) {
            const db = await openDB();
            return idbReq(
                db.transaction(STORE_MACHINES, 'readwrite').objectStore(STORE_MACHINES),
                'delete', localId
            );
        },

        countPendingMachines: async function () {
            return (await this.getMachineDrafts()).length;
        },

        // Lädt offline angehängte Maschinen-Fotos/Dokumente hoch (inkl. Vorschaubild für Fotos),
        // sobald wieder online — spiegelt die Logik von uploadMachineFiles() in index.html.
        uploadPendingMachineFiles: async function (draft) {
            if (!draft.pending_files || !draft.pending_files.length) return [];
            if (!window.FileUploadService) return [];

            const folderName = window.getMachineFolderName
                ? window.getMachineFolderName(draft.machine_id, draft.manufacturer, draft.name, draft.serial, draft.year)
                : `Maschinen/${draft.machine_id}`;

            const pathGenerator = (file, i) => {
                const isImg = file.type && file.type.startsWith('image/');
                const subfolder = isImg ? 'Vorschaubilder' : 'Dokumente';
                const fileExt = file.name.split('.').pop();
                const cleanName = file.name.split('.').slice(0, -1).join('.').replace(/[^a-zA-Z0-9_\- ]/g, '_');
                return `${folderName}/${subfolder}/${cleanName}_${Date.now()}-${i}.${fileExt}`;
            };

            const uploadResults = await window.FileUploadService.uploadFiles(
                draft.pending_files,
                pathGenerator,
                { bucket: 'dateien', compress: true, concurrency: 5, provider: 'cloudflare-r2' }
            );

            const fileEntries = [];
            for (let i = 0; i < uploadResults.length; i++) {
                const res = uploadResults[i];
                const originalFile = draft.pending_files[i];
                const entry = { name: res.name, type: res.type, url: res.url };

                if (originalFile.type && originalFile.type.startsWith('image/') && res.path) {
                    try {
                        const thumbFile = await window.FileUploadService.generateThumbnail(originalFile);
                        if (thumbFile) {
                            const thumbPath = res.path.replace('/Vorschaubilder/', '/Vorschaubilder/thumbs/');
                            const thumbResult = await window.FileUploadService.uploadFile(thumbFile, {
                                bucket: 'dateien', path: thumbPath, compress: false, provider: 'cloudflare-r2'
                            });
                            entry.thumbnail_url = thumbResult.url;
                        }
                    } catch (e) {
                        console.warn('Thumbnail-Erstellung fehlgeschlagen:', e);
                    }
                }
                fileEntries.push(entry);
            }
            return fileEntries;
        },

        // Verarbeitet alle offline gespeicherten Maschinen-Bearbeitungen nach Wiederverbindung
        syncPendingMachines: async function () {
            const drafts = await this.getMachineDrafts();
            if (!drafts.length) return { synced: 0, errors: [] };

            const supabase = window.supabaseClient;
            if (!supabase) return { synced: 0, errors: [] };

            let synced = 0;
            const errors = [];

            for (const draft of drafts) {
                try {
                    const newFiles = await this.uploadPendingMachineFiles(draft);

                    // Entfernte Dateien aus R2 löschen
                    if (draft.removed_files && draft.removed_files.length && window.FileUploadService) {
                        for (const f of draft.removed_files) {
                            try {
                                if (f.path) await window.FileUploadService.deleteFile(f.path, { bucket: 'dateien', provider: 'cloudflare-r2' });
                            } catch (e) {
                                console.warn('Löschen einer entfernten Datei fehlgeschlagen:', e);
                            }
                        }
                    }

                    const finalFiles = [...(draft.data.existing_files || []), ...newFiles]
                        .filter(f => !(f.type === 'meta' && ['related_machine_ids', 'additional_equipment', 'is_next_maintenance_auto'].includes(f.key)));

                    if (draft.data.related_machine_ids && draft.data.related_machine_ids.length) {
                        finalFiles.push({ type: 'meta', key: 'related_machine_ids', property: JSON.stringify(draft.data.related_machine_ids) });
                    }
                    if (draft.data.additional_equipment && draft.data.additional_equipment.length) {
                        finalFiles.push({ type: 'meta', key: 'additional_equipment', property: JSON.stringify(draft.data.additional_equipment) });
                    }
                    if (draft.data.is_auto) {
                        finalFiles.push({ type: 'meta', key: 'is_next_maintenance_auto', property: 'true' });
                    }

                    let mainImageUrl = draft.data.main_image_url_raw;
                    if (!mainImageUrl || mainImageUrl.startsWith('data:')) {
                        const firstImage = finalFiles.find(f => (f.type && f.type.startsWith('image/')) || (f.url && /\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)(\?.*)?$/i.test(f.url)));
                        mainImageUrl = firstImage ? firstImage.url : null;
                    }

                    const updatePayload = Object.assign({}, draft.data);
                    delete updatePayload.existing_files;
                    delete updatePayload.main_image_url_raw;
                    delete updatePayload.related_machine_ids;
                    delete updatePayload.additional_equipment;
                    delete updatePayload.is_auto;
                    updatePayload.files = finalFiles;
                    updatePayload.image_url = mainImageUrl;

                    const { error } = await supabase.from('machines').update(updatePayload).eq('id', draft.machine_id);
                    if (error) throw error;

                    // Verknüpfungs- und Ansprechpartner-Sync nachträglich anwenden (wie beim Online-Speichern)
                    try {
                        if (typeof window.syncBidirectionalLinks === 'function') {
                            await window.syncBidirectionalLinks(draft.machine_id, draft.data.related_machine_ids || [], []);
                        }
                        if (typeof window.syncContactPersonsToRelatedMachines === 'function') {
                            const cps = (draft.data.contact_persons || []).filter(p => p.name);
                            await window.syncContactPersonsToRelatedMachines(draft.machine_id, draft.data.related_machine_ids || [], cps);
                        }
                    } catch (syncErr) {
                        console.warn('Verknüpfungs-/Ansprechpartner-Sync nach Offline-Speicherung fehlgeschlagen:', syncErr);
                    }

                    await this.deleteMachineDraft(draft.local_id);
                    synced++;
                } catch (err) {
                    console.error('[offlineService] Machine sync error for draft', draft.local_id, err);
                    errors.push({ draft, err: err && (err.message || err.error_description || JSON.stringify(err)) });
                }
            }

            return { synced, errors };
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
        const serviceCount = await window.offlineService.countPending();
        const machineCount = await window.offlineService.countPendingMachines();
        const count = serviceCount + machineCount;
        const badge  = document.getElementById('offline-pending-badge');
        if (!badge) return;
        badge.textContent    = count || '';
        badge.style.display  = count > 0 ? 'inline-flex' : 'none';
    };

    async function onBackOnline() {
        updateOfflineBanner();
        const drafts = await window.offlineService.getDrafts();
        const machineDrafts = await window.offlineService.getMachineDrafts();
        if (!drafts.length && !machineDrafts.length) return;

        const totalCount = drafts.length + machineDrafts.length;
        window.showSyncToast(
            `${totalCount} Änderung${totalCount > 1 ? 'en' : ''} werden synchronisiert…`,
            'syncing'
        );

        try {
            const result = await window.offlineService.syncPending();
            const machineResult = await window.offlineService.syncPendingMachines();

            const totalSynced = result.synced + machineResult.synced;
            if (totalSynced > 0) {
                window.showSyncToast(
                    `${totalSynced} Änderung${totalSynced > 1 ? 'en' : ''} erfolgreich synchronisiert.`,
                    'success'
                );
            }

            const allErrors = [...(result.errors || []), ...(machineResult.errors || [])];
            if (allErrors.length) {
                const firstErr = allErrors[0].err;
                window.showSyncToast(`${allErrors.length} Fehler beim Synchronisieren: ${firstErr}`, 'error');
                console.error('[offlineService] Sync-Fehler Details:', allErrors);
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

        // Pending Entwürfe können auch entstehen, ohne dass der Browser je ein "online"-Event
        // feuert (z.B. App offline gespeichert, dann Tab geschlossen, später mit bereits
        // bestehender Verbindung neu geöffnet — kein Offline→Online-Übergang in dieser Sitzung).
        // Daher hier zusätzlich beim Start prüfen, falls schon online.
        if (navigator.onLine) {
            onBackOnline();
        }
    });
})();
