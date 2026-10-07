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
const ERLAUBT = /^(image\/|video\/|application\/pdf$)/;

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
    return 'jpg';
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = new URL(req.url);

    if (req.method === 'GET') {
        const g = await geraetPruefen(url.searchParams.get('schluessel'));
        return g ? json({ ok: true, name: g.name }) : json({ ok: false, error: 'Schlüssel ungültig oder gesperrt' }, 403);
    }
    if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

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
        const res = await aws.fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${pfad}`, {
            method: 'PUT', headers: { 'Content-Type': typ }, body: await f.arrayBuffer(),
        });
        if (!res.ok) { fehler.push(`${f.name}: Ablage fehlgeschlagen`); continue; }
        const { error } = await db.from('foto_eingang').insert({
            geraet_id: geraet.id, absender: geraet.name, notiz,
            url: `${R2_PUBLIC_URL}/${pfad}`, pfad, dateiname: f.name || null, typ, groesse: f.size,
        });
        if (error) {
            await aws.fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${pfad}`, { method: 'DELETE' });
            fehler.push(`${f.name}: ${error.message}`);
            continue;
        }
        angekommen++;
    }

    await db.from('foto_geraete').update({ letzte_nutzung: new Date().toISOString() }).eq('id', geraet.id);
    return json({ ok: angekommen > 0, angekommen, fehler }, angekommen ? 200 : 500);
});
