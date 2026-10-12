// Foto-Eingang: Handys OHNE Anmeldung laden Fotos hoch.
// Zugang nur über einen Geräte-Schlüssel (Tabelle foto_geraete, in der App
// erzeugt, einzeln sperrbar). Der Schlüssel darf NUR hierher hochladen —
// kein Lesen, kein Löschen, keine anderen Tabellen.
//
// Ausrollen OHNE JWT-Prüfung (die Handys sind nicht angemeldet):
//   supabase functions deploy foto-eingang --no-verify-jwt
// Secrets: dieselben R2_* wie r2-sign; SUPABASE_SERVICE_ROLE_KEY ist automatisch da.
//
// POST multipart/form-data
//   Kopf  x-foto-schluessel: <Schlüssel>   (oder Feld „schluessel")
//   Felder: fotos (eine oder mehrere Dateien), notiz (optional)
// GET ?schluessel=… → { ok, name } (prüft nur den Schlüssel, für die Einrichtung)
//
// Sprachaufnahmen (audio/*): werden wie Fotos abgelegt und danach von Google Gemini
// abgeschrieben (Spalten text/text_status, Migration supabase_add_foto_eingang_sprache.sql).
// Secrets wie ki-proxy: GEMINI_API_KEY (+ GEMINI_MODEL / GEMINI_FALLBACK_MODELS als Ausweichmodelle), kein eigenes nötig.
// POST application/json { abschreiben: <id> } mit Authorization: Bearer <JWT eines App-Nutzers>
//   → schreibt eine vorhandene Aufnahme erneut ab (Knopf „Text erzeugen" in der App).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!;
const R2_ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY')!;
const R2_SECRET_KEY = Deno.env.get('R2_SECRET_KEY')!;
const R2_BUCKET     = Deno.env.get('R2_BUCKET') ?? 'dateien';
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') ?? 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev';
const R2_ENDPOINT   = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const MAX_DATEI = 25 * 1024 * 1024;
const MAX_ANZAHL = 30;
const ERLAUBT = /^(image\/|video\/|audio\/|application\/pdf$)/;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
// Modelle für die Abschrift, der Reihe nach: Bei JEDEM Fehler (abgeschaltet, überlastet,
// Limit, Zeitüberschreitung) geht es sofort mit dem nächsten weiter. Kein eigenes Secret
// nötig — genutzt werden die vorhandenen GEMINI_MODEL / GEMINI_FALLBACK_MODELS von ki-proxy;
// GEMINI_AUDIO_MODEL (optional) kommt nur nach vorn. Zuerst ein volles Flash-Modell (hört
// besser als Flash-Lite). Reicht alles nicht, fragt die Function Google, welche Flash-Modelle
// dieser Schlüssel kennt, und probiert die neuesten davon.
// 2026-10-08: gemini-2.5-flash ist für neue Konten abgeschaltet, Google nennt 3.8-flash.
const AUDIO_MODELLE = [
    Deno.env.get('GEMINI_AUDIO_MODEL') ?? '',
    'gemini-3.8-flash',
    ...(Deno.env.get('GEMINI_FALLBACK_MODELS') ?? '').split(','),
    Deno.env.get('GEMINI_MODEL') ?? '',
].map(s => s.trim()).filter((m, i, a) => m && a.indexOf(m) === i);
const VERSUCH_MS = 60_000;
let letztesGutesModell = '';   // lebt, solange die Function warm ist
const ABSCHRIFT_PROMPT = 'Schreibe diese deutsche Sprachaufnahme wörtlich ab. Sie stammt aus einer Werkstatt für ' +
    'Recycling-Maschinen (Schredder, Siebanlagen, Bagger, Radlader): jemand geht um eine Maschine und spricht Befunde ein. ' +
    'Fachbegriffe, Typbezeichnungen und Zahlen genau übernehmen. Füllwörter (äh, ähm) weglassen, sinnvolle Absätze und ' +
    'Satzzeichen setzen, nichts zusammenfassen und nichts hinzufügen. Unverständliches als [?]. ' +
    'Ist nichts Verständliches zu hören, antworte nur mit: [keine Sprache erkannt]. Gib nur den Text aus.';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-foto-schluessel, content-type, apikey, authorization, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function geraetPruefen(schluessel: string | null) {
    if (!schluessel || schluessel.length < 20 || schluessel.length > 200) return null;
    const { data } = await db.from('foto_geraete').select('id, name, gesperrt').eq('schluessel', schluessel).maybeSingle();
    if (!data || data.gesperrt) return null;
    return data as { id: string; name: string };
}

function endung(name: string, typ: string) {
    const teile = name.split('.');
    const e = teile.length > 1 ? teile.pop()!.toLowerCase() : '';
    if (/^[a-z0-9]{2,5}$/.test(e)) return e;
    if (typ === 'image/png') return 'png';
    if (typ === 'image/heic') return 'heic';
    if (typ === 'application/pdf') return 'pdf';
    if (typ.startsWith('video/')) return typ.split('/')[1] || 'mp4';
    if (typ.startsWith('audio/')) return /mp4|aac|m4a/.test(typ) ? 'm4a' : (typ.split(/[\/;]/)[1] || 'webm');
    return 'jpg';
}

function base64(buf: ArrayBuffer) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
}

// Aufnahme → Text über Gemini; Ergebnis direkt in die Zeile schreiben.
async function abschreiben(id: string, typ: string, daten: ArrayBuffer) {
    if (!GEMINI_API_KEY) {
        await db.from('foto_eingang').update({ text_status: 'fehler', text_fehler: 'GEMINI_API_KEY fehlt in den Secrets' }).eq('id', id);
        return;
    }
    await db.from('foto_eingang').update({ text_status: 'laeuft', text_fehler: null }).eq('id', id);
    const mime = typ.split(';')[0].trim() || 'audio/webm';
    const body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: ABSCHRIFT_PROMPT }, { inline_data: { mime_type: mime, data: base64(daten) } }] }],
        generationConfig: { temperature: 0 },
    });
    const fehler: string[] = [];
    const versucht = new Set<string>();

    async function versuch(modell: string) {
        versucht.add(modell);
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modell}:generateContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
                body, signal: AbortSignal.timeout(VERSUCH_MS),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error?.message || ('HTTP ' + res.status));
            const text = (j?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('').trim();
            if (!text) throw new Error('leere Antwort');
            return text;
        } catch (e) {
            const m = (e as Error).name === 'TimeoutError' ? 'keine Antwort in 60 s' : String((e as Error).message || e);
            fehler.push(`${modell}: ${m.slice(0, 120)}`);
            console.warn('Abschrift', modell, m);
            return '';
        }
    }

    const reihe = [letztesGutesModell, ...AUDIO_MODELLE].filter((m, i, a) => m && a.indexOf(m) === i);
    let text = '';
    for (const m of reihe) { text = await versuch(m); if (text) { letztesGutesModell = m; break; } }
    if (!text) {
        for (const m of await flashModelle()) {
            if (versucht.has(m)) continue;
            text = await versuch(m);
            if (text) { letztesGutesModell = m; break; }
        }
    }
    if (text) await db.from('foto_eingang').update({ text, text_status: 'fertig', text_fehler: null }).eq('id', id);
    else await db.from('foto_eingang').update({ text_status: 'fehler', text_fehler: ('Kein Modell hat geantwortet — ' + fehler.join(' | ')).slice(0, 600) }).eq('id', id);
}

// Notnagel: die neuesten Flash-Modelle, die dieser Schlüssel laut Google nutzen darf (höchstens 4).
let flashCache: string[] | null = null;
async function flashModelle(): Promise<string[]> {
    if (flashCache) return flashCache;
    try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': GEMINI_API_KEY } });
        const d = await r.json();
        const vers = (n: string) => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(n) || ['', '0'])[1]);
        flashCache = (d.models || [])
            .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
                /gemini-[\d.]+-flash/.test(m.name) && !/image|tts|live|audio-dialog|embedding/.test(m.name) &&
                (m.supportedGenerationMethods || []).includes('generateContent'))
            .map((m: { name: string }) => m.name.replace(/^models\//, ''))
            .sort((a: string, b: string) => (vers(b) - vers(a)) || (Number(a.includes('lite')) - Number(b.includes('lite'))))
            .slice(0, 4);
    } catch { flashCache = []; }
    return flashCache!;
}

// Läuft nach der Antwort weiter, damit das Handy nicht auf die Abschrift warten muss.
function imHintergrund(p: Promise<unknown>) {
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(p);
    return p;
}

async function erneutAbschreiben(req: Request) {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null };
    if (!u?.user) return json({ error: 'Nicht angemeldet' }, 401);
    const body = await req.json().catch(() => ({}));
    const { data: z } = await db.from('foto_eingang').select('id, url, typ').eq('id', String(body.abschreiben || '')).maybeSingle();
    if (!z || !/^audio\//.test(z.typ || '')) return json({ error: 'Keine Aufnahme' }, 404);
    const r = await fetch(z.url);
    if (!r.ok) return json({ error: 'Aufnahme nicht lesbar' }, 502);
    await abschreiben(z.id, z.typ, await r.arrayBuffer());
    const { data: neu } = await db.from('foto_eingang').select('text, text_status, text_fehler').eq('id', z.id).single();
    return json({ ok: neu?.text_status === 'fertig', ...neu });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = new URL(req.url);

    if (req.method === 'GET') {
        const g = await geraetPruefen(url.searchParams.get('schluessel'));
        return g ? json({ ok: true, name: g.name }) : json({ ok: false, error: 'Schlüssel ungültig oder gesperrt' }, 403);
    }
    if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
    if ((req.headers.get('content-type') || '').includes('application/json')) return erneutAbschreiben(req);

    let form: FormData;
    try { form = await req.formData(); } catch { return json({ error: 'Erwartet multipart/form-data' }, 400); }

    const geraet = await geraetPruefen(req.headers.get('x-foto-schluessel') || String(form.get('schluessel') || ''));
    if (!geraet) return json({ error: 'Schlüssel ungültig oder gesperrt' }, 403);

    const notiz = String(form.get('notiz') || '').trim().slice(0, 1000) || null;
    const dateien = [...form.getAll('fotos'), ...form.getAll('foto'), ...form.getAll('file')]
        .filter((f): f is File => f instanceof File && f.size > 0);
    if (!dateien.length) return json({ error: 'Keine Datei dabei' }, 400);
    if (dateien.length > MAX_ANZAHL) return json({ error: `Höchstens ${MAX_ANZAHL} Dateien auf einmal` }, 400);

    const aws = new AwsClient({ accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY, service: 's3', region: 'auto' });
    const tag = new Date().toISOString().slice(0, 10);
    let angekommen = 0;
    const fehler: string[] = [];

    for (const [i, f] of dateien.entries()) {
        const typ = f.type || 'image/jpeg';
        if (!ERLAUBT.test(typ)) { fehler.push(`${f.name}: Dateityp nicht erlaubt`); continue; }
        if (f.size > MAX_DATEI) { fehler.push(`${f.name}: größer als 25 MB`); continue; }
        const pfad = `foto-eingang/${tag}/${geraet.id}/${Date.now()}-${i}-${crypto.randomUUID().slice(0, 8)}.${endung(f.name || '', typ)}`;
        const daten = await f.arrayBuffer();
        const res = await aws.fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${pfad}`, {
            method: 'PUT', headers: { 'Content-Type': typ }, body: daten,
        });
        if (!res.ok) { fehler.push(`${f.name}: Ablage fehlgeschlagen`); continue; }
        const istTon = typ.startsWith('audio/');
        const { data: neu, error } = await db.from('foto_eingang').insert({
            geraet_id: geraet.id, absender: geraet.name, notiz,
            url: `${R2_PUBLIC_URL}/${pfad}`, pfad, dateiname: f.name || null, typ, groesse: f.size,
            ...(istTon ? { text_status: 'laeuft' } : {}),
        }).select('id').single();
        if (error) {
            await aws.fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${pfad}`, { method: 'DELETE' });
            fehler.push(`${f.name}: ${error.message}`);
            continue;
        }
        angekommen++;
        // Nicht abwarten: das Handy ist sofort fertig, der Text kommt per Realtime in der App an.
        if (istTon && neu) imHintergrund(abschreiben(neu.id, typ, daten));
    }

    await db.from('foto_geraete').update({ letzte_nutzung: new Date().toISOString() }).eq('id', geraet.id);
    return json({ ok: angekommen > 0, angekommen, fehler }, angekommen ? 200 : 500);
});
