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
//    GEMINI_FALLBACK_MODELS optional, Ausweichmodelle bei Überlast, kommagetrennt
//                        (leer = die Function fragt Google nach verfügbaren Flash-Modellen 3.x)
//    AI_TIMEOUT_MS       optional, Wartezeit je Modell bis zum Ausweichen (15000)
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
// Ausweichmodelle, wenn das Hauptmodell überlastet ist (503 „high demand"),
// ein Limit meldet (429) oder nicht rechtzeitig antwortet.
// 2026-09-24: gemini-3.5-flash-lite lieferte 503 bzw. brauchte 25 s.
// Fest eingetragen per Secret GEMINI_FALLBACK_MODELS (kommagetrennt) — sonst
// fragt die Function Google einmal, welche Flash-Modelle dieser Schlüssel nutzen
// darf (2.5 wird für neue Konten gelistet, aber abgelehnt → nicht raten).
const GEMINI_FALLBACKS_FEST = (Deno.env.get('GEMINI_FALLBACK_MODELS') ?? '')
    .split(',').map(s => s.trim()).filter(m => m && m !== GEMINI_MODEL);
let geminiFallbacksCache: string[] | null = null;
async function geminiFallbacks(): Promise<string[]> {
    if (GEMINI_FALLBACKS_FEST.length) return GEMINI_FALLBACKS_FEST;
    if (geminiFallbacksCache) return geminiFallbacksCache;
    try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': GEMINI_API_KEY } });
        const d = await r.json();
        const vers = (id: string) => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(id) || ['', '0'])[1]);
        const ids: string[] = (d.models || [])
            .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map((m: { name: string }) => m.name.replace('models/', ''))
            .filter((id: string) => /^gemini-/.test(id) && /flash/.test(id) && !/preview|exp|tts|image|audio|live|thinking/.test(id))
            // nur Generation 3+ (2.x wird für neue Konten abgelehnt), neueste zuerst, „lite" vor voll
            .filter((id: string) => vers(id) >= 3 && id !== GEMINI_MODEL)
            .sort((a: string, b: string) => vers(b) - vers(a) || (Number(/lite/.test(b)) - Number(/lite/.test(a))));
        geminiFallbacksCache = ids.slice(0, 3);
    } catch (e) {
        console.warn('KI: Modellliste nicht ladbar', e);
        geminiFallbacksCache = [];
    }
    return geminiFallbacksCache;
}
// ── Selbst umstellen: welches Modell läuft gerade? ─────────────────────────
// Je Modell: gemittelte Antwortzeit, Erfolge/Fehler, „gesperrt bis".
// Überlastet (503/429/zu langsam) → 10 min überspringen, unbekannt (404) → 24 h.
// Reihenfolge je Anfrage: nicht gesperrte Modelle nach Antwortzeit (schnellstes
// zuerst, unbekannte hinten), gesperrte ganz hinten als letzte Rettung.
// Gespeichert in app_settings.ki_modell_status — gilt für alle Nutzer und
// überlebt Neustarts der Function; in der App unter Einstellungen → KI sichtbar.
type ModellZustand = { ms?: number; ok?: number; fehler?: number; gesperrtBis?: number; letzterFehler?: string; zuletzt?: string };
let zustand: Record<string, ModellZustand> | null = null;
let adminClient: ReturnType<typeof createClient> | null = null;
function admin() {
    if (!adminClient) adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    return adminClient;
}
async function zustandLaden() {
    if (zustand) return;
    try {
        const { data } = await admin().from('app_settings').select('value').eq('key', 'ki_modell_status').maybeSingle();
        const v = data?.value as { modelle?: Record<string, ModellZustand> } | null;
        zustand = (v && v.modelle) || {};
    } catch { zustand = {}; }
}
function zustandSpeichern() {
    const p = admin().from('app_settings').upsert({ key: 'ki_modell_status', value: { modelle: zustand, aktualisiert: new Date().toISOString() } })
        .then(() => {}, (e: unknown) => console.warn('KI-Status nicht gespeichert', e));
    // Nach der Antwort weiterlaufen lassen (Supabase Edge Runtime)
    const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt) rt.waitUntil(p as Promise<unknown>);
}
function merkeErfolg(m: string, ms: number) {
    const z = zustand![m] = zustand![m] || {};
    z.ms = z.ms ? Math.round(z.ms * 0.7 + ms * 0.3) : ms;
    z.ok = (z.ok || 0) + 1;
    z.gesperrtBis = 0;
    z.zuletzt = new Date().toISOString();
}
function merkeFehler(m: string, grund: string, sperreMin: number) {
    const z = zustand![m] = zustand![m] || {};
    z.fehler = (z.fehler || 0) + 1;
    z.gesperrtBis = Date.now() + sperreMin * 60 * 1000;
    z.letzterFehler = grund + ' · ' + new Date().toISOString();
}
function reihenfolge(modelle: string[]): string[] {
    const jetzt = Date.now();
    const z = (m: string) => zustand![m] || {};
    const frei = modelle.filter(m => !(z(m).gesperrtBis! > jetzt));
    const gesperrt = modelle.filter(m => z(m).gesperrtBis! > jetzt)
        .sort((a, b) => (z(a).gesperrtBis || 0) - (z(b).gesperrtBis || 0));   // bald wieder frei zuerst
    // Unbekannte Antwortzeit zählt als 8 s — ein bekannt langsames Modell (25 s) lässt
    // damit ungetesteten Alternativen den Vortritt; bei Gleichstand Listenreihenfolge.
    frei.sort((a, b) => (z(a).ms ?? 8000) - (z(b).ms ?? 8000) || modelle.indexOf(a) - modelle.indexOf(b));
    return [...frei, ...gesperrt];
}

// Wartezeit bis zur ersten Antwort je Modell, danach das nächste versuchen.
const WARTEN_MS = parseInt(Deno.env.get('AI_TIMEOUT_MS') ?? '15000', 10) || 15000;
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

    let url: string, key: string;
    let modelle: string[];
    if (PROVIDER === 'gemini') { url = GEMINI_URL; key = GEMINI_API_KEY; modelle = [GEMINI_MODEL, ...(await geminiFallbacks())]; }
    else { url = GROQ_URL; key = GROQ_API_KEY; modelle = [GROQ_MODELS.has(String(body.model)) ? String(body.model) : GROQ_MODEL]; }

    // Gemini: Reasoning so tief wie möglich — spart den Großteil der Wartezeit.
    // Welche Stufe das Modell annimmt, wird durchprobiert (none → minimal → low → ohne).
    const stufen: (string | null)[] = PROVIDER === 'gemini' ? ['none', 'minimal', 'low', null] : [null];

    // Ein Modell anfragen; bei 400 wegen der Reasoning-Stufe die nächste Stufe.
    // Wartet höchstens WARTEN_MS auf die erste Antwort (Kopfzeilen) — danach
    // gilt das Modell als überlastet.
    async function frage(model: string): Promise<Response | 'zeit'> {
        let r: Response | null = null;
        for (const stufe of stufen) {
            const payload: Record<string, unknown> = { ...basis, model };
            if (stufe) payload.reasoning_effort = stufe;
            if (stufe === 'none') payload.extra_body = { google: { thinking_config: { thinking_budget: 0 } } };
            const abbruch = new AbortController();
            const uhr = setTimeout(() => abbruch.abort(), WARTEN_MS);
            try {
                r = await fetch(url, { method: 'POST', signal: abbruch.signal, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify(payload) });
            } catch (e) {
                clearTimeout(uhr);
                if (abbruch.signal.aborted) return 'zeit';
                throw e;
            }
            // Beim Streamen läuft die Antwort nach den Kopfzeilen weiter — dann
            // darf die Uhr nicht mehr abbrechen. Ohne Streamen wird der Text
            // unten ohnehin sofort gelesen.
            clearTimeout(uhr);
            if (r.ok || stufe === null) break;
            const kopie = await r.clone().text();
            if (!(r.status === 400 && /reasoning|thinking|budget/i.test(kopie))) break;
        }
        return r!;
    }

    // Überlastet (503), Limit (429), Modell unbekannt (404), Serverfehler oder zu langsam
    // → nächstes Modell. Alles andere (z. B. 400/401) geht unverändert zurück.
    if (PROVIDER === 'gemini') { await zustandLaden(); modelle = reihenfolge(modelle); }
    let antwort: Response | null = null;
    let model = modelle[0];
    let geaendert = false;
    for (const m of modelle) {
        model = m;
        let r: Response | 'zeit';
        const start = Date.now();
        try { r = await frage(m); }
        catch (e) { return fehler(`${PROVIDER === 'gemini' ? 'Gemini' : 'Groq'} ist nicht erreichbar: ` + (e instanceof Error ? e.message : String(e)), 502); }
        if (r === 'zeit') {
            console.warn(`KI: ${m} antwortet nicht in ${WARTEN_MS} ms — nächstes Modell`);
            if (zustand) { merkeFehler(m, 'zu langsam', 10); geaendert = true; }
            continue;
        }
        antwort = r;
        if (r.ok) { if (zustand) { merkeErfolg(m, Date.now() - start); geaendert = true; } break; }
        if (![404, 429, 500, 502, 503, 504].includes(r.status)) break;
        console.warn(`KI: ${m} meldet ${r.status} — nächstes Modell`);
        if (zustand) { merkeFehler(m, 'HTTP ' + r.status, r.status === 404 ? 24 * 60 : 10); geaendert = true; }
    }
    if (geaendert) zustandSpeichern();
    if (!antwort) return fehler('Die KI ist gerade überlastet (alle Modelle zu langsam). Bitte gleich noch einmal versuchen.', 503);

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
