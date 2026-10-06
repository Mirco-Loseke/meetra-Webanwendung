#!/usr/bin/env node
// Versionen automatisch hochzählen (Cache-Bust).
//
//   node tools/version.js          geänderte Dateien finden und hochzählen
//   node tools/version.js --probe  nur anzeigen, nichts schreiben
//
// Merkt sich in tools/.versionen.json einen Fingerabdruck (SHA-1) jeder Datei
// unter js/, css/ und lib/, die index.html per ?v=N einbindet. Beim nächsten
// Lauf wird für jede geänderte Datei
//   - ?v=N in index.html um 1 erhöht,
//   - CACHE_NAME in sw.js um 1 erhöht (einmal je Lauf),
//   - „CACHE_NAME: vN" in CLAUDE.md nachgezogen.
// Außerdem: Warnung für js/css-Dateien, die in index.html eingebunden sind,
// aber in der PRECACHE-Liste von sw.js fehlen (dann fehlen sie offline).
//
// Erster Lauf: merkt sich nur den Stand, zählt nichts hoch.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');
const CLAUDE = path.join(ROOT, 'CLAUDE.md');
const STAND = path.join(__dirname, '.versionen.json');
const probe = process.argv.includes('--probe');

const lies = f => fs.readFileSync(f, 'utf8');
const hash = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

let index = lies(INDEX);
// Alle eingebundenen Dateien mit Versionsnummer: src="js/x.js?v=3", href="css/a/b.css?v=12"
const RE = /(src|href)="((?:js|css|lib)\/[^"?]+)\?v=(\d+)"/g;
const eingebunden = new Map();   // pfad -> v
for (const m of index.matchAll(RE)) eingebunden.set(m[2], +m[3]);

const alt = fs.existsSync(STAND) ? JSON.parse(lies(STAND)) : null;
const neu = {};
const geaendert = [];
const neuDazu = [];   // neu eingebunden: Datei bleibt v1, nur der Cache-Name zählt hoch
const fehlt = [];
for (const [rel] of eingebunden) {
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) { fehlt.push(rel); continue; }
    neu[rel] = hash(f);
    if (alt && alt[rel] && alt[rel] !== neu[rel]) geaendert.push(rel);
    if (alt && !alt[rel]) neuDazu.push(rel);
}

// PRECACHE-Prüfung
const sw = lies(SW);
const pre = new Set([...sw.matchAll(/^\s*'([^']+)',?\s*$/gm)].map(m => m[1]));
const ohneCache = [...eingebunden.keys()].filter(r => /^(js|css)\//.test(r) && !pre.has(r));

if (!alt) {
    if (!probe) fs.writeFileSync(STAND, JSON.stringify(neu, null, 1));
    console.log(`Erster Lauf: Stand von ${Object.keys(neu).length} Dateien gemerkt. Ab jetzt zählt das Skript Änderungen hoch.`);
} else if (!geaendert.length && !neuDazu.length) {
    console.log('Keine geänderten Dateien — nichts hochzuzählen.');
} else {
    if (geaendert.length) console.log(`${geaendert.length} geänderte Datei(en):`);
    if (neuDazu.length) console.log(`${neuDazu.length} neu eingebunden (bleibt v1): ${neuDazu.join(', ')}`);
    for (const rel of geaendert) {
        const v = eingebunden.get(rel), v2 = v + 1;
        console.log(`  ${rel}  v${v} → v${v2}`);
        const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        index = index.replace(new RegExp(`((?:src|href)="${esc})\\?v=${v}"`, 'g'), `$1?v=${v2}"`);
    }
    const cm = /CACHE_NAME = 'meetra-app-v(\d+)'/.exec(sw);
    if (!cm) { console.error('CACHE_NAME in sw.js nicht gefunden — bitte von Hand prüfen.'); process.exitCode = 1; }
    const c2 = cm ? +cm[1] + 1 : null;
    if (cm) console.log(`  sw.js CACHE_NAME  v${cm[1]} → v${c2}`);
    if (!probe) {
        fs.writeFileSync(INDEX, index);
        if (cm) {
            // BOM am Dateianfang erhalten
            fs.writeFileSync(SW, sw.replace(cm[0], `CACHE_NAME = 'meetra-app-v${c2}'`));
            if (fs.existsSync(CLAUDE)) {
                const cl = lies(CLAUDE).replace(/CACHE_NAME: v\d+/, `CACHE_NAME: v${c2}`);
                fs.writeFileSync(CLAUDE, cl);
            }
        }
        fs.writeFileSync(STAND, JSON.stringify(neu, null, 1));
        // Gegenprobe: jede hochgezählte Datei steht mit neuer Nummer in index.html
        const kaputt = geaendert.filter(rel => !lies(INDEX).includes(`${rel}?v=${eingebunden.get(rel) + 1}"`));
        if (kaputt.length) { console.error('ACHTUNG, nicht ersetzt: ' + kaputt.join(', ')); process.exitCode = 1; }
        else console.log('Fertig — index.html, sw.js und CLAUDE.md aktualisiert.');
    } else {
        console.log('(Probe — nichts geschrieben)');
    }
}

if (fehlt.length) console.warn('\nIn index.html eingebunden, aber Datei fehlt:\n  ' + fehlt.join('\n  '));
if (ohneCache.length) console.warn('\nFehlt in PRECACHE (sw.js) — offline nicht verfügbar:\n  ' + ohneCache.join('\n  '));
