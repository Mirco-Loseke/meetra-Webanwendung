// ==========================================================
// App-Basis: Offline-Erkennung, globale Fehlerbehandlung, Dialog fuer ungespeicherte Aenderungen
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 5102-5150).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        // Beim Wechsel von WLAN auf Mobilfunk (oder umgekehrt) kann navigator.onLine für einen
        // kurzen Moment "false" melden, obwohl gleich wieder eine Verbindung besteht (Handover).
        // Vor Aktionen, die deshalb fälschlich in den Offline-Modus wechseln würden (z.B. Speichern),
        // hiermit kurz nachprüfen statt dem ersten Signal sofort zu vertrauen.
        window.isLikelyOffline = async function () {
            if (navigator.onLine) return false;
            await new Promise(r => setTimeout(r, 1500));
            return !navigator.onLine;
        };

        // Ersteller-ID für Spalten vom Typ uuid.
        // Die App-Nutzer stehen in public.users mit einer bigint-ID (1, 2, 3 …),
        // waehrend internal_processes.user_id und maintenance_events.user_id
        // uuid-Spalten sind (FK auf auth.users). Wird die bigint-ID dort
        // eingetragen, scheitert das Speichern mit
        //   invalid input syntax for type uuid: "1"
        // Deshalb nur weitergeben, was auch wirklich eine uuid ist — sonst null.
        window.uuidUserId = function () {
            const id = window.activeUser && window.activeUser.id;
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))
                ? String(id)
                : null;
        };

        // Einfügen mit Ersteller-Angabe.
        // created_by_user (bigint, FK auf public.users) kommt aus
        // supabase/supabase_fix_process_user.sql. Ist die Datei im Projekt des
        // Nutzers noch nicht ausgeführt, fehlt die Spalte — dann wird ohne sie
        // gespeichert, damit der Vorgang nicht verloren geht.
        window.insertMitErsteller = async function (table, payload) {
            const mitErsteller = Object.assign({}, payload, {
                user_id: window.uuidUserId(),
                created_by_user: (window.activeUser && window.activeUser.id) || null
            });
            let res = await window.supabaseClient.from(table).insert([mitErsteller]);
            if (res.error && /created_by_user/.test(res.error.message || '')) {
                const ohne = Object.assign({}, mitErsteller);
                delete ohne.created_by_user;
                res = await window.supabaseClient.from(table).insert([ohne]);
            }
            return res;
        };

        // ==========================================
        // EINFÜGEN, DAS AN EINER SPALTE NICHT SCHEITERT
        // ==========================================
        // Hintergrund: mehrere Stellen hatten einen Wiederholversuch, der die
        // störende Spalte am NAMEN in der Fehlermeldung erkannte
        // (`/customer_id|history_ref/.test(error.message)`). Bei einem
        // Typkonflikt nennt Postgres den Spaltennamen aber gar nicht:
        //
        //   invalid input syntax for type bigint: "976f0107-bdb4-…"
        //
        // Genau das passiert, wenn eine Migration nicht (oder in einer alten
        // Fassung) gelaufen ist und z. B. maintenance_events.customer_id noch
        // bigint statt uuid ist. Der Wiederholversuch griff nie, und das
        // Speichern brach komplett ab — obwohl nur EIN Feld unpassend war.
        //
        // Diese Fassung sucht die störenden Felder zusätzlich über den WERT aus
        // der Meldung und lässt nur weg, was in `optional` freigegeben ist.
        // Zurück kommt neben dem Ergebnis die Liste der weggelassenen Felder,
        // damit der Aufrufer sagen kann, was fehlt und welche SQL-Datei hilft.
        window.insertRobust = async function (table, payload, opts) {
            const o = opts || {};
            const optional = o.optional || [];
            const client = window.supabaseClient;
            const versuch = Object.assign({}, payload);
            const weggelassen = [];
            let res;

            for (let i = 0; i <= optional.length; i++) {
                if (o.mitErsteller === false) {
                    res = o.select
                        ? await client.from(table).insert([versuch]).select(o.select).limit(1)
                        : await client.from(table).insert([versuch]);
                } else if (o.select) {
                    // Wie insertMitErsteller, aber mit Rückgabe der neuen id.
                    const mit = Object.assign({}, versuch, {
                        user_id: window.uuidUserId(),
                        created_by_user: (window.activeUser && window.activeUser.id) || null
                    });
                    res = await client.from(table).insert([mit]).select(o.select).limit(1);
                    if (res.error && /created_by_user/.test(res.error.message || '')) {
                        delete mit.created_by_user;
                        res = await client.from(table).insert([mit]).select(o.select).limit(1);
                    }
                } else {
                    res = await window.insertMitErsteller(table, versuch);
                }
                if (!res.error) break;

                const msg = res.error.message || '';
                const stoerend = new Set();

                // 1) Spalte ist in der Meldung genannt (fehlende Spalte o. ä.)
                optional.forEach(k => { if (msg.includes(k)) stoerend.add(k); });

                // 2) Typkonflikt: Postgres nennt nur den WERT. Über den Wert
                //    zurück auf das Feld schließen.
                const m = msg.match(/invalid input syntax for type \w+: "([^"]+)"/);
                if (m) {
                    optional.forEach(k => {
                        if (k in versuch && versuch[k] != null && String(versuch[k]) === m[1]) stoerend.add(k);
                    });
                }

                if (!stoerend.size) break; // anderer Fehler -> nach oben geben
                stoerend.forEach(k => { delete versuch[k]; weggelassen.push(k); });
            }

            return { error: res ? res.error : null, data: res ? res.data : null, weggelassen: weggelassen };
        };

        // Global Error Handler for user feedback
        window.onerror = function (msg, url, lineNo, columnNo, error) {
            const message = [
                'Fehler: ' + msg,
                'URL: ' + url,
                'Zeile: ' + lineNo,
                'Spalte: ' + columnNo,
                'Error: ' + JSON.stringify(error)
            ].join('\n');
            console.error('GLOBAL ERROR:', message);
            // window.showToast('Ein unerwarteter Fehler ist aufgetreten:\n' + msg);
            return false;
        };

        // ==========================================
        // SHARED UNSAVED CHANGES DIALOG
        // ==========================================
        window.showUnsavedDialog = function ({ overlayId, onDiscard, onSave }) {
            document.getElementById(overlayId)?.remove();
            const el = document.createElement('div');
            el.id = overlayId;
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
            el.innerHTML = `
                <div style="background:linear-gradient(135deg,rgba(30,41,59,0.98),rgba(15,23,42,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:1.75rem 2rem;max-width:380px;width:90%;box-shadow:0 30px 80px rgba(0,0,0,0.6);font-family:'Inter',sans-serif;text-align:center;">
                    <h3 style="color:#fff;font-size:1.05rem;font-weight:800;margin:0 0 0.6rem 0;">Ungespeicherte Änderungen</h3>
                    <p style="color:rgba(255,255,255,0.55);font-size:0.88rem;margin:0 0 1.5rem 0;line-height:1.5;">Möchtest du ohne Speichern verlassen?</p>
                    <div style="display:flex;gap:0.75rem;justify-content:center;">
                        <button id="${overlayId}-discard" style="flex:1;padding:0.7rem 1rem;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:12px;color:rgba(255,255,255,0.75);font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;font-size:0.88rem;transition:background 0.2s;">Trotzdem Schließen</button>
                        <button id="${overlayId}-save" style="flex:1;padding:0.7rem 1rem;background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.4);border-radius:12px;color:#34d399;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;font-size:0.88rem;transition:background 0.2s;">Speichern</button>
                    </div>
                </div>
            `;
            document.body.appendChild(el);
            document.getElementById(overlayId + '-discard').onclick = () => { el.remove(); onDiscard(); };
            document.getElementById(overlayId + '-save').onclick = () => { el.remove(); onSave(); };
        };

        // ==========================================
        // RELOAD-SCHUTZ (beforeunload)
        // ==========================================
        // showUnsavedDialog oben greift nur beim Schliessen eines Fensters.
        // Beim Neuladen (F5), Zurueck oder Tab-Schliessen gab es bislang gar
        // keine Rueckfrage — der halb ausgefuellte Servicebericht war weg.
        //
        // Die Dirty-Merker der Module (serviceberichtIsDirty, taskIsDirty,
        // protocolIsDirty) sind modul-lokal und von aussen nicht lesbar.
        // Deshalb meldet jedes Modul hier eine Prueffunktion an; sie wird
        // erst beim Verlassen aufgerufen.
        //
        // Achtung: Den Text der Rueckfrage bestimmt der Browser, nicht wir —
        // returnValue muss trotzdem gesetzt werden, sonst erscheint sie nicht.
        window._unsavedChecks = window._unsavedChecks || [];

        window.registerUnsavedCheck = function (fn) {
            if (typeof fn === 'function' && window._unsavedChecks.indexOf(fn) === -1) {
                window._unsavedChecks.push(fn);
            }
        };

        window.hasUnsavedChanges = function () {
            return window._unsavedChecks.some(fn => {
                try { return !!fn(); } catch (e) { return false; }
            });
        };

        window.addEventListener('beforeunload', function (e) {
            if (!window.hasUnsavedChanges()) return;
            e.preventDefault();
            e.returnValue = '';
            return '';
        });

        console.log('Inline Script Loaded');
