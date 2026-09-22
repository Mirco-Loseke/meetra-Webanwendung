// ==========================================================
// EINSTELLUNGEN → KI: Anbieter-Wahl (Groq / Gemini-Test)
// ==========================================================
// Markup: partials/settings/ai.html. Die Weiche selbst sitzt in
// js/groq-proxy.js (window.groqFetch → geminiFetch). Hier nur: Werte in
// localStorage lesen/schreiben und die Modell-Liste bei Google abfragen.
//
// localStorage: ki_anbieter ('groq' | 'gemini'), gemini_api_key, gemini_modell
// ==========================================================
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const toast = m => (typeof window.showToast === 'function' ? window.showToast(m) : console.log(m));

    function felderZeigen() {
        const box = $('ki-gemini-felder'); if (!box) return;
        box.hidden = $('ki-anbieter').value !== 'gemini';
    }

    function laden() {
        if (!$('ki-anbieter')) return;
        $('ki-anbieter').value = localStorage.getItem('ki_anbieter') === 'gemini' ? 'gemini' : 'groq';
        $('ki-gemini-key').value = localStorage.getItem('gemini_api_key') || '';
        const m = localStorage.getItem('gemini_modell');
        if (m && ![...$('ki-gemini-modell').options].some(o => o.value === m)) $('ki-gemini-modell').add(new Option(m, m));
        if (m) $('ki-gemini-modell').value = m;
        felderZeigen();
        const st = $('ki-anbieter-status');
        if (st) st.textContent = window.kiAnbieter && window.kiAnbieter() === 'gemini' ? 'Aktiv: Gemini (' + window.geminiModell() + ')' : 'Aktiv: Server (ki-proxy)';
    }

    // Verfügbare Text-Modelle bei Google holen; Vorgabe = neuestes stabiles Flash-Modell.
    async function modelleLaden() {
        const key = $('ki-gemini-key').value.trim();
        const st = $('ki-anbieter-status');
        if (!key) { st.textContent = 'Zuerst den Gemini-Key eintragen.'; return; }
        st.textContent = 'Modelle werden geladen …';
        try {
            const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
            const d = await r.json();
            if (!r.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + r.status));
            const ids = (d.models || [])
                .filter(x => (x.supportedGenerationMethods || []).includes('generateContent'))
                .map(x => x.name.replace('models/', ''))
                .filter(id => /^gemini/.test(id) && !/tts|image|audio|embedding|live|robotics|computer-use/i.test(id))
                .sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || b.localeCompare(a, undefined, { numeric: true }));
            if (!ids.length) throw new Error('Google liefert keine Text-Modelle für diesen Key.');
            const vers = id => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(id) || [0, 0])[1]);
            const stabil = ids.filter(id => /flash/.test(id) && !/preview|exp/.test(id)).sort((a, b) => vers(b) - vers(a) || (/lite/.test(b) - /lite/.test(a)));
            const bisher = $('ki-gemini-modell').value;
            $('ki-gemini-modell').innerHTML = ids.map(id => '<option value="' + id + '">' + id + '</option>').join('');
            $('ki-gemini-modell').value = ids.includes(bisher) ? bisher : (stabil[0] || ids[0]);
            st.textContent = ids.length + ' Modelle geladen — Vorschlag: ' + $('ki-gemini-modell').value;
        } catch (e) { st.textContent = 'Modelle konnten nicht geladen werden: ' + e.message; }
    }

    function speichern() {
        const anbieter = $('ki-anbieter').value;
        const key = $('ki-gemini-key').value.trim();
        if (anbieter === 'gemini' && !key) { toast('Für Gemini muss ein API-Key eingetragen sein.'); return; }
        localStorage.setItem('ki_anbieter', anbieter);
        if (key) localStorage.setItem('gemini_api_key', key); else localStorage.removeItem('gemini_api_key');
        localStorage.setItem('gemini_modell', $('ki-gemini-modell').value);
        toast(anbieter === 'gemini' ? 'KI läuft jetzt über Gemini mit dem Key aus diesem Browser (' + $('ki-gemini-modell').value + ').' : 'KI läuft über den Server (ki-proxy).');
        laden();
        if (typeof window.pruefeKiVerbindung === 'function') window.pruefeKiVerbindung();
    }

    window.kiEinstellungenRender = laden;

    document.addEventListener('DOMContentLoaded', function () {
        if (!$('ki-anbieter')) return;
        $('ki-anbieter').addEventListener('change', felderZeigen);
        $('ki-gemini-modelle').addEventListener('click', modelleLaden);
        $('ki-anbieter-speichern').addEventListener('click', speichern);
        laden();
    });
})();
