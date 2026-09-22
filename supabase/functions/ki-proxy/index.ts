// =============================================================================
//  ki-proxy — Vorschalt für alle KI-Anfragen der App (Gemini oder Groq)
// =============================================================================
//  Nachfolger von groq-proxy (2026-09-21). Der Anbieter wird per Secret
//  gewählt; der Schlüssel liegt nur hier auf dem Server, nie im Browser.
//
//  Ablauf:
//    Browser --(Text + JWT des angemeldeten Nutzers)--> diese Function
//    Function prüft die Anmeldung, hängt den Key aus den Secrets an und ruft
//    den Anbieter (beide sprechen das OpenAI-Format). Zurück geht NUR die
//    Antwort — Statuscode, retry-after und JSON-Text unverändert, damit die
//    Fehlerbehandlung in js/ai-quick-capture.js weiter greift.
//
//  Secrets (Supabase → Edge Functions → Secrets):
//    AI_PROVIDER         'gemini' (Vorgabe) oder 'groq'
//    GEMINI_API_KEY      Pflicht bei gemini (aistudio.google.com/apikey)
//    GEMINI_MODEL        optional, Vorgabe: gemini-2.5-flash-lite
//    GROQ_API_KEY        Pflicht bei groq
//    GROQ_MODEL_DEFAULT  optional, Vorgabe: llama-3.3-70b-versatile
//    AI_DAILY_LIMIT      optional, Anfragen je Nutzer und Tag (0 = ohne Grenze)
//
//  Ausrollen: supabase/SETUP_KI.txt
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROVIDER = (Deno.env.get('AI_PROVIDER') ?? 'gemini').toLowerCase();
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL_DEFAULT') ?? 'llama-3.3-70b-versatile';
const DAILY_LIMIT = parseInt(Deno.env.get('AI_DAILY_LIMIT') ?? '0', 10) || 0;

// Bei Groq nur bekannte Modelle durchlassen (sonst bucht jemand ein teures
// Modell auf euer Kontingent). Bei Gemini gilt immer GEMINI_MODEL.
const GROQ_MODELS = new Set([GROQ_MODEL, 'llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct']);

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'retry-after, x-ki-anbieter, x-ki-modell',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, ...extra, 'Content-Type': 'application/json' } });
}
function fehler(message: string, status: number) { return json({ error: { message } }, status); }

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return fehler('Nur POST', 405);

    if (PROVIDER === 'gemini' && !GEMINI_API_KEY) return fehler('Auf dem Server fehlt das Secret GEMINI_API_KEY.', 500);
    if (PROVIDER === 'groq' && !GROQ_API_KEY) return fehler('Auf dem Server fehlt das Secret GROQ_API_KEY.', 500);
    if (PROVIDER !== 'gemini' && PROVIDER !== 'groq') return fehler(`Unbekannter AI_PROVIDER „${PROVIDER}" — erlaubt: gemini, groq.`, 500);

    // ── Anmeldung prüfen ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fehler('Nicht angemeldet.', 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return fehler('Nicht angemeldet.', 401);

    // ── Anfrage lesen ─────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return fehler('Ungültiges JSON.', 400); }
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) return fehler('Es wurden keine Nachrichten übergeben.', 400);

    // ── Tagesgrenze je Nutzer (optional, fehlertolerant) ──────────────────
    if (DAILY_LIMIT > 0) {
        try {
            const heute = new Date().toISOString().slice(0, 10);
            const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
            const { data: zeile } = await admin.from('ai_usage').select('calls').eq('user_id', user.id).eq('day', heute).maybeSingle();
            if (zeile && zeile.calls >= DAILY_LIMIT) return fehler(`Dein KI-Kontingent für heute ist aufgebraucht (${DAILY_LIMIT} Anfragen). Morgen geht es weiter.`, 429);
            await admin.from('ai_usage').upsert({ user_id: user.id, day: heute, calls: (zeile?.calls ?? 0) + 1, last_at: new Date().toISOString() }, { onConflict: 'user_id,day' });
        } catch (e) { console.warn('Verbrauchszählung übersprungen:', e); }
    }

    // ── Nutzlast bauen (nur bekannte Felder durchlassen) ──────────────────
    const basis: Record<string, unknown> = { messages };
    if (typeof body.temperature === 'number') basis.temperature = body.temperature;
    if (typeof body.max_tokens === 'number') basis.max_tokens = Math.min(body.max_tokens, 8192);
    if (body.response_format) basis.response_format = body.response_format;
    // Streaming: die Antwort wird Stück für Stück durchgereicht (SSE), der Browser
    // zeigt den Text während des Schreibens an — spürbar kürzere Wartezeit.
    const streamen = body.stream === true;
    if (streamen) basis.stream = true;

    let url: string, key: string, model: string;
    if (PROVIDER === 'gemini') { url = GEMINI_URL; key = GEMINI_API_KEY; model = GEMINI_MODEL; }
    else { url = GROQ_URL; key = GROQ_API_KEY; model = GROQ_MODELS.has(String(body.model)) ? String(body.model) : GROQ_MODEL; }

    // Gemini: Reasoning so tief wie möglich — spart den Großteil der Wartezeit.
    // Welche Stufe das Modell annimmt, wird durchprobiert (none → minimal → low → ohne).
    const stufen: (string | null)[] = PROVIDER === 'gemini' ? ['none', 'minimal', 'low', null] : [null];

    let antwort: Response | null = null;
    for (const stufe of stufen) {
        const payload: Record<string, unknown> = { ...basis, model };
        if (stufe) payload.reasoning_effort = stufe;
        if (stufe === 'none') payload.extra_body = { google: { thinking_config: { thinking_budget: 0 } } };
        try {
            antwort = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify(payload) });
        } catch (e) {
            return fehler(`${PROVIDER === 'gemini' ? 'Gemini' : 'Groq'} ist nicht erreichbar: ` + (e instanceof Error ? e.message : String(e)), 502);
        }
        if (antwort.ok || stufe === null) break;
        // 400 wegen Reasoning-Stufe → nächste Stufe; jeder andere Fehler geht durch.
        const kopie = await antwort.clone().text();
        if (!(antwort.status === 400 && /reasoning|thinking|budget/i.test(kopie))) break;
    }

    // ── Antwort unverändert durchreichen ──────────────────────────────────
    const extra: Record<string, string> = { 'x-ki-anbieter': PROVIDER, 'x-ki-modell': model };
    const retryAfter = antwort!.headers.get('retry-after');
    if (retryAfter) extra['retry-after'] = retryAfter;
    if (streamen && antwort!.ok && antwort!.body) {
        return new Response(antwort!.body, { status: 200, headers: { ...CORS, ...extra, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
    }
    const text = await antwort!.text();
    return new Response(text, { status: antwort!.status, headers: { ...CORS, ...extra, 'Content-Type': 'application/json' } });
});
