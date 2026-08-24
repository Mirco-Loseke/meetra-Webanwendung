// =============================================================================
//  groq-proxy — Vorschalt für alle KI-Anfragen der App
// =============================================================================
//  Warum es das gibt:
//  Der Groq-API-Key lag früher bei JEDEM Nutzer im localStorage. Jeder musste
//  ihn selbst eintragen, und wer den Browser öffnen konnte, konnte ihn auslesen
//  und privat weiterverwenden. Ein Schlüssel, der im Browser landet, ist nicht
//  geheim zu halten — deshalb geht er hier gar nicht mehr dorthin.
//
//  Ablauf:
//    Browser --(Text + JWT des angemeldeten Nutzers)--> diese Function
//    Function prüft die Anmeldung, hängt den Key aus den Supabase Secrets an
//    und ruft Groq. Zurück geht NUR die Antwort.
//
//  Wichtig für den Client: Statuscode, Kopfzeilen (retry-after) und der
//  JSON-Text von Groq werden UNVERÄNDERT durchgereicht. Dadurch funktioniert
//  die vorhandene Fehlerbehandlung in js/ai-quick-capture.js (429-Nachfassen,
//  Modell-Ausweichen, Meldungstexte) ohne Anpassung weiter.
//
//  Secrets (supabase secrets set …):
//    GROQ_API_KEY        Pflicht. Der Schlüssel aus console.groq.com/keys
//    GROQ_MODEL_DEFAULT  optional, Vorgabe: llama-3.3-70b-versatile
//    GROQ_MODELS_ALLOWED optional, Komma-Liste zusätzlich erlaubter Modelle
//    AI_DAILY_LIMIT      optional, Anfragen je Nutzer und Tag (0 = ohne Grenze)
//
//  Ausrollen: siehe supabase/SETUP_GROQ.txt
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const MODEL_DEFAULT = Deno.env.get('GROQ_MODEL_DEFAULT') ?? 'llama-3.3-70b-versatile';
const DAILY_LIMIT = parseInt(Deno.env.get('AI_DAILY_LIMIT') ?? '0', 10) || 0;

// Nur bekannte Modelle durchlassen. Sonst könnte jemand mit gültiger Anmeldung
// ein beliebig teures Modell auf euer Kontingent buchen.
const MODELS_ALLOWED = new Set(
    [
        MODEL_DEFAULT,
        'llama-3.3-70b-versatile',
        // Bild-/PDF-Auswertung in der Buchhaltung (js/accounting.js)
        'meta-llama/llama-4-scout-17b-16e-instruct',
        ...(Deno.env.get('GROQ_MODELS_ALLOWED') ?? '').split(',').map(s => s.trim()),
    ].filter(Boolean)
);

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, ...extra, 'Content-Type': 'application/json' },
    });
}

// Fehlerform von Groq nachbilden, damit der Client nur einen Fall kennen muss.
function fehler(message: string, status: number) {
    return json({ error: { message } }, status);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return fehler('Nur POST', 405);

    if (!GROQ_API_KEY) {
        return fehler('Auf dem Server ist kein Groq-Schlüssel hinterlegt. Bitte GROQ_API_KEY als Supabase Secret setzen.', 500);
    }

    // ── Anmeldung prüfen ──────────────────────────────────────────────────
    // Ohne gültiges JWT eines angemeldeten Nutzers geht hier nichts weiter.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fehler('Nicht angemeldet.', 401);

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return fehler('Nicht angemeldet.', 401);

    // ── Anfrage lesen ─────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return fehler('Ungültiges JSON.', 400);
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
        return fehler('Es wurden keine Nachrichten übergeben.', 400);
    }

    const gewuenscht = typeof body.model === 'string' ? body.model : '';
    const model = MODELS_ALLOWED.has(gewuenscht) ? gewuenscht : MODEL_DEFAULT;

    // ── Tagesgrenze je Nutzer (optional) ──────────────────────────────────
    // Bewusst fehlertolerant: fehlt die Tabelle oder klemmt die Abfrage, läuft
    // die Anfrage trotzdem durch. Eine kaputte Zählung darf die KI nicht
    // lahmlegen — die Grenze ist ein Schutz vor Versehen, keine Zugangssperre.
    const heute = new Date().toISOString().slice(0, 10);
    if (DAILY_LIMIT > 0) {
        try {
            const admin = createClient(
                Deno.env.get('SUPABASE_URL')!,
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            );
            const { data: zeile } = await admin
                .from('ai_usage')
                .select('calls')
                .eq('user_id', user.id)
                .eq('day', heute)
                .maybeSingle();
            if (zeile && zeile.calls >= DAILY_LIMIT) {
                return fehler(`Dein KI-Kontingent für heute ist aufgebraucht (${DAILY_LIMIT} Anfragen). Morgen geht es weiter.`, 429);
            }
            await admin.from('ai_usage').upsert(
                { user_id: user.id, day: heute, calls: (zeile?.calls ?? 0) + 1, last_at: new Date().toISOString() },
                { onConflict: 'user_id,day' }
            );
        } catch (e) {
            console.warn('Verbrauchszählung übersprungen:', e);
        }
    }

    // ── Weiterreichen an Groq ─────────────────────────────────────────────
    const payload: Record<string, unknown> = { model, messages };
    if (typeof body.temperature === 'number') payload.temperature = body.temperature;
    if (typeof body.max_tokens === 'number') payload.max_tokens = Math.min(body.max_tokens, 8192);
    if (body.response_format) payload.response_format = body.response_format;

    let antwort: Response;
    try {
        antwort = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify(payload),
        });
    } catch (e) {
        return fehler('Groq ist nicht erreichbar: ' + (e instanceof Error ? e.message : String(e)), 502);
    }

    // Status und Text unverändert zurückgeben. `retry-after` wird mitgenommen,
    // weil der Client danach seine Wartezeit beim Minutenlimit bemisst.
    const text = await antwort.text();
    const extra: Record<string, string> = {};
    const retryAfter = antwort.headers.get('retry-after');
    if (retryAfter) extra['retry-after'] = retryAfter;

    return new Response(text, {
        status: antwort.status,
        headers: { ...CORS, ...extra, 'Content-Type': 'application/json' },
    });
});
