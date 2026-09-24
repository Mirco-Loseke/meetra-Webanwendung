// Sage-Abgleich (tools/sage-sync.ps1) → Supabase, OHNE Generalschlüssel im Skript.
// Das Skript kennt nur SAGE_SYNC_TOKEN (Header x-sync-token). Diese Function
// erlaubt genau das, was der Abgleich braucht — und nichts sonst:
//   lesen    customers / angebote, nur die Abgleich-Spalten
//   anlegen  customers / angebote, nur erlaubte Spalten
//   aendern  customers / angebote per id, nur erlaubte Spalten
//   stempel  app_settings.angebote_last_import = { at, by: 'Server' }
// Kein Löschen, keine anderen Tabellen. Ausrollen OHNE „Verify JWT".
// npm: statt esm.sh — esm.sh lieferte beim Ausrollen "Module not found" (2026-09-23).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

// R2 (dieselben Secrets wie r2-sign) — nur für Angebots-PDFs.
const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const R2_BUCKET     = Deno.env.get('R2_BUCKET') ?? 'dateien';
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') ?? 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev';
const aws = new AwsClient({
    accessKeyId: Deno.env.get('R2_ACCESS_KEY') ?? '',
    secretAccessKey: Deno.env.get('R2_SECRET_KEY') ?? '',
    service: 's3', region: 'auto',
});

const TOKEN = Deno.env.get('SAGE_SYNC_TOKEN') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
});

const SPALTEN: Record<string, { lesen: string[]; schreiben: string[] }> = {
    customers: {
        lesen: ['id', 'address_number', 'customer_number', 'matchcode', 'name', 'street', 'zip_code', 'city', 'country', 'phone', 'email', 'sage_stand'],
        schreiben: ['address_number', 'customer_number', 'matchcode', 'name', 'street', 'zip_code', 'city', 'country', 'phone', 'email', 'sage_stand'],
    },
    angebote: {
        lesen: ['id', 'belegnummer', 'belegdatum', 'kundenmatchcode', 'nettobetrag', 'bruttobetrag', 'customer_id'],
        schreiben: ['belegnummer', 'belegdatum', 'kundenmatchcode', 'nettobetrag', 'bruttobetrag', 'customer_id'],
    },
    rechnungen: {
        lesen: ['id', 'sage_bel_id', 'belegart', 'belegnummer', 'belegjahr', 'belegdatum', 'address_number', 'customer_id', 'kundenmatchcode', 'netto', 'mwst', 'brutto'],
        schreiben: ['sage_bel_id', 'belegart', 'belegnummer', 'belegjahr', 'belegdatum', 'address_number', 'customer_id', 'kundenmatchcode', 'netto', 'mwst', 'brutto', 'aktualisiert_am'],
    },
};
const MAX_ZEILEN = 500;

function antwort(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

// Vergleich in konstanter Zeit, damit die Antwortzeit das Token nicht verrät.
function gleich(a: string, b: string) {
    const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
    let d = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
    return d === 0;
}

function filtern(zeile: Record<string, unknown>, erlaubt: string[]) {
    const r: Record<string, unknown> = {};
    for (const k of erlaubt) if (k in zeile) r[k] = zeile[k];
    return r;
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return antwort({ error: 'Nur POST' }, 405);
    if (TOKEN.length < 32 || !gleich(req.headers.get('x-sync-token') ?? '', TOKEN)) {
        return antwort({ error: 'Unauthorized' }, 401);
    }

    let b: { aktion?: string; tabelle?: string; zeilen?: Record<string, unknown>[]; fehler?: string; naechste?: string };
    try { b = await req.json(); } catch { return antwort({ error: 'Kein JSON' }, 400); }

    // Status für die Zeile unter der Angebotsliste (js/listen.js).
    // Erfolg: at = jetzt. Fehler: at (letzter Erfolg) bleibt, Fehlertext + Zeitpunkt dazu.
    if (b.aktion === 'stempel') {
        const jetzt = new Date().toISOString();
        const naechste = typeof b.naechste === 'string' && !isNaN(Date.parse(b.naechste)) ? b.naechste : null;
        let value: Record<string, unknown>;
        if (b.fehler) {
            const { data } = await db.from('app_settings').select('value').eq('key', 'angebote_last_import').maybeSingle();
            const alt = (data?.value && typeof data.value === 'object') ? data.value as Record<string, unknown> : {};
            value = { ...alt, by: 'Server', status: 'fehler', fehler: String(b.fehler).slice(0, 300), fehler_at: jetzt, naechste };
        } else {
            value = { at: jetzt, by: 'Server', status: 'ok', naechste };
        }
        const { error } = await db.from('app_settings').upsert({ key: 'angebote_last_import', value });
        return error ? antwort({ error: error.message }, 500) : antwort({ ok: true });
    }

    // ---- Angebots-PDF an den Vorgang des Angebots hängen ----
    // pdf_pruefen: gibt es die Datei dort schon (Prüfsumme oder gleiche Größe)?
    //   Wenn nicht → signierte Upload-URL (5 min) nur für vorgaenge/<Vorgang>/…
    // pdf_fertig:  nach dem Hochladen den Eintrag in attachments ergänzen.
    if (b.aktion === 'pdf_pruefen' || b.aktion === 'pdf_fertig') {
        const p = b as unknown as { angebot_id?: number; name?: string; size?: number; sha256?: string; key?: string };
        const name = String(p.name ?? '').replace(/[\\/]/g, '_').slice(0, 200);
        const size = Number(p.size);
        const sha = String(p.sha256 ?? '').toLowerCase();
        if (!p.angebot_id || !name.toLowerCase().endsWith('.pdf') || !(size > 0) || size > 25 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(sha)) {
            return antwort({ error: 'Ungültige Angaben' }, 400);
        }
        const { data: ang, error: e1 } = await db.from('angebote').select('id, belegnummer, process_id').eq('id', p.angebot_id).maybeSingle();
        if (e1) return antwort({ error: e1.message }, 500);
        if (!ang) return antwort({ status: 'kein_angebot' });
        if (!ang.process_id) return antwort({ status: 'kein_vorgang' });
        const { data: proc, error: e2 } = await db.from('internal_processes').select('attachments').eq('id', ang.process_id).maybeSingle();
        if (e2) return antwort({ error: e2.message }, 500);
        const liste: Record<string, unknown>[] = Array.isArray(proc?.attachments) ? proc!.attachments : [];
        const schonDa = liste.some(f => !f.step_id && (f.sha256 === sha
            || (Number(f.size) === size && String(f.name ?? '').toLowerCase().endsWith('.pdf'))));
        if (schonDa) return antwort({ status: 'vorhanden', belegnummer: ang.belegnummer });

        const praefix = `vorgaenge/${ang.process_id}/`;
        if (b.aktion === 'pdf_pruefen') {
            const key = `${praefix}${Date.now()}-sage-${name.replace(/[^\w.\-]+/g, '_')}`;
            const ziel = new URL(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
            ziel.searchParams.set('X-Amz-Expires', '300');
            const signiert = await aws.sign(new Request(ziel.toString(), { method: 'PUT', headers: { 'Content-Type': 'application/pdf' } }), { aws: { signQuery: true } });
            return antwort({ status: 'hochladen', uploadUrl: signiert.url, key, belegnummer: ang.belegnummer });
        }

        const key = String(p.key ?? '');
        if (!key.startsWith(praefix) || key.includes('..')) return antwort({ error: 'Ungültiger Schlüssel' }, 400);
        liste.push({
            id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            name, url: `${R2_PUBLIC_URL}/${key}`, path: key, size, type: 'application/pdf',
            at: new Date().toISOString(), by: 'Sage-Abgleich', step_id: null, sha256: sha,
        });
        const { error: e3 } = await db.from('internal_processes').update({ attachments: liste }).eq('id', ang.process_id);
        return e3 ? antwort({ error: e3.message }, 500) : antwort({ status: 'angehaengt', belegnummer: ang.belegnummer });
    }

    const t = SPALTEN[b.tabelle ?? ''];
    if (!t) return antwort({ error: 'Tabelle nicht erlaubt' }, 400);

    if (b.aktion === 'lesen') {
        const alle: unknown[] = [];
        for (let von = 0; ; von += 1000) {
            const { data, error } = await db.from(b.tabelle!).select(t.lesen.join(',')).order('id').range(von, von + 999);
            if (error) return antwort({ error: error.message }, 500);
            alle.push(...(data ?? []));
            if (!data || data.length < 1000) break;
        }
        return antwort({ zeilen: alle });
    }

    const zeilen = Array.isArray(b.zeilen) ? b.zeilen : [];
    if (!zeilen.length) return antwort({ ok: true, anzahl: 0 });
    if (zeilen.length > MAX_ZEILEN) return antwort({ error: `Höchstens ${MAX_ZEILEN} Zeilen je Aufruf` }, 400);

    if (b.aktion === 'anlegen') {
        const rows = zeilen.map(z => filtern(z, t.schreiben));
        const { error } = await db.from(b.tabelle!).insert(rows);
        return error ? antwort({ error: error.message }, 500) : antwort({ ok: true, anzahl: rows.length });
    }

    if (b.aktion === 'aendern') {
        let n = 0;
        for (const z of zeilen) {
            const id = z.id;
            const felder = filtern((z.felder ?? {}) as Record<string, unknown>, t.schreiben);
            if (id == null || !Object.keys(felder).length) continue;
            const { error } = await db.from(b.tabelle!).update(felder).eq('id', id);
            if (error) return antwort({ error: `id ${id}: ${error.message}`, geaendert: n }, 500);
            n++;
        }
        return antwort({ ok: true, anzahl: n });
    }

    return antwort({ error: 'Unbekannte Aktion' }, 400);
});
