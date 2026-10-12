// ==========================================================
// FOTOS: NICHTS DOPPELT HOCHLADEN, NICHTS DOPPELT ANZEIGEN
// ==========================================================
// Gemeinsamer Unterbau fuer alle Stellen, an denen Bilder ausgewaehlt werden
// (Protokolle, Maschinen, Servicebericht …). Zwei Aufgaben:
//
//   1. BEIM AUSWAEHLEN: ein Bild, das in dieser Liste schon steckt, wird gar
//      nicht erst hochgeladen. Erkannt wird es am Inhalt (SHA-256 der Datei),
//      hilfsweise an Dateiname + Groesse. Der Inhaltsvergleich ist noetig, weil
//      das Handy beim zweiten Antippen dieselbe Aufnahme mit neuem Zeitstempel
//      im Namen liefern kann; der Namensvergleich ist noetig, weil bereits
//      gespeicherte Bilder nur noch als Pfad + Groesse vorliegen.
//
//   2. VOR DEM ANZEIGEN UND SPEICHERN: doppelte Eintraege aus der Liste werfen.
//      Das faengt alles ab, was frueher schon hineingeraten ist — etwa wenn ein
//      Speichern zweimal losgelaufen ist.
//
// crypto.subtle steht ueber https und ueber file:// zur Verfuegung. Fehlt es
// (sehr alter Browser), faellt die Erkennung still auf Name + Groesse zurueck.
(function () {
    'use strict';

    // Den urspruenglichen Dateinamen aus einem Ablagepfad herausschaelen.
    // Beim Hochladen haengt jedes Modul einen Zeitstempel an — mal davor, mal
    // dahinter, teils mit laufender Nummer. Ohne diese Bereinigung wuerde
    // dieselbe Datei nie als bekannt erkannt:
    //   Protokolle/Fotos/12/1723456789012_bild.jpg
    //   .../Serviceberichte/1723456789012-0-bild.jpg
    //   .../Vorschaubilder/bild_1723456789012-0.jpg
    //   Documents/Rechnung_1723456789012.pdf
    function baseName(path) {
        let file = String(path || '').split('/').pop() || '';
        file = file.split('?')[0];
        file = file.replace(/^\d{10,}[-_](?:\d+[-_])?/, '');          // Zeitstempel vorn
        file = file.replace(/[-_]\d{10,}(?:[-_]\d+)?(?=\.[^.]+$)/, ''); // Zeitstempel hinten
        return file;
    }

    // Zweitschluessel: Name + Groesse. Greift auch bei laengst gespeicherten
    // Dateien, von denen es keinen Inhalts-Hash mehr gibt. Sonderzeichen werden
    // wie beim Hochladen zu "_", sonst passt "IMG 12.jpg" nicht zu "IMG_12.jpg".
    function nameKey(name, size) {
        const clean = baseName(name).toLowerCase().replace(/[^a-z0-9.]/g, '_');
        return clean + '|' + (size == null ? '' : size);
    }

    // Nur der Anfang der Datei wird gelesen, die Groesse kommt in den Schluessel.
    // Ein 12-MB-Foto komplett einzulesen kostete beim Auswaehlen spuerbar Zeit,
    // ohne dass es die Erkennung besser macht: zwei verschiedene Aufnahmen
    // stimmen weder in den ersten 2 MB noch in der Groesse ueberein.
    const HASH_BYTES = 2 * 1024 * 1024;

    async function hashFile(file) {
        try {
            if (!window.crypto || !window.crypto.subtle || !file.slice) return null;
            const teil = file.slice(0, HASH_BYTES);
            if (!teil.arrayBuffer) return null;
            const buf = await teil.arrayBuffer();
            const digest = await window.crypto.subtle.digest('SHA-256', buf);
            const hex = Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0')).join('');
            return hex + ':' + file.size;
        } catch (e) {
            return null; // kein Hash moeglich — Name + Groesse muessen reichen
        }
    }

    // Alle Erkennungsmerkmale einer bereits vorhandenen Liste einsammeln.
    // Erwartet Objekte mit file_name/file_size (so liegen sie ueberall vor);
    // ein im Speicher gehaltener Hash steht unter _hash.
    function knownKeys(existing) {
        const hashes = new Set();
        const names = new Set();
        (existing || []).forEach(p => {
            if (!p) return;
            if (p._hash) hashes.add(p._hash);
            // Pfad vor Anzeigename: der Anzeigename ist mancherorts ohne Endung
            // gespeichert (Dokumente) und taugt allein nicht zum Vergleich.
            const name = p.file_name || p.file_path || p.path || p.url || p.file_url || p.name || '';
            if (!name) return;
            const size = p.file_size != null ? p.file_size : p.size;
            names.add(nameKey(name, size));
            // Zusaetzlich ohne Groesse: bereits gespeicherte Dateien fuehren
            // teils nur Name und URL mit (z. B. die Anhaenge des Serviceberichts).
            names.add(nameKey(name, null));
        });
        return { hashes, names };
    }

    // Trennt die Auswahl in „neu" und „schon da".
    // Rueckgabe: { neu: [{ file, hash }], doppelt: [Dateiname, …] }
    async function pruefeAuswahl(files, existing) {
        const { hashes, names } = knownKeys(existing);
        const neu = [];
        const doppelt = [];

        for (const file of Array.from(files || [])) {
            const hash = await hashFile(file);
            const nkey = nameKey(file.name, file.size);
            const nkeyOhneGroesse = nameKey(file.name, null);
            if ((hash && hashes.has(hash)) || names.has(nkey) || names.has(nkeyOhneGroesse)) {
                doppelt.push(file.name);
                continue;
            }
            // Auch innerhalb einer Auswahl doppelt Angetippte nur einmal nehmen.
            if (hash) hashes.add(hash);
            names.add(nkey);
            names.add(nkeyOhneGroesse);
            neu.push({ file: file, hash: hash });
        }
        return { neu: neu, doppelt: doppelt };
    }

    // Doppelte aus einer fertigen Liste werfen. Der erste Eintrag gewinnt,
    // die Reihenfolge bleibt erhalten.
    function bereinigeListe(list) {
        const gesehen = new Set();
        const raus = [];
        (list || []).forEach(p => {
            if (!p) return;
            const name = p.file_name || p.file_path || p.path || p.url || p.file_url || p.name || '';
            const key = p._hash || (p.file_url || p.url || '') + '#' + nameKey(name, p.file_size != null ? p.file_size : p.size);
            if (gesehen.has(key)) return;
            gesehen.add(key);
            raus.push(p);
        });
        return raus;
    }

    // Hinweis, wenn etwas uebersprungen wurde — sonst wundert sich der Nutzer,
    // warum weniger Bilder erscheinen als er ausgewaehlt hat.
    function meldeDoppelte(doppelt) {
        if (!doppelt || !doppelt.length || !window.showToast) return;
        const txt = doppelt.length === 1
            ? `„${doppelt[0]}" war schon vorhanden und wurde übersprungen.`
            : `${doppelt.length} Bilder waren schon vorhanden und wurden übersprungen.`;
        window.showToast(txt);
    }

    window.PhotoDedupe = {
        hashFile: hashFile,
        pruefeAuswahl: pruefeAuswahl,
        bereinigeListe: bereinigeListe,
        meldeDoppelte: meldeDoppelte
    };
})();
