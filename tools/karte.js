// ==========================================================
// PROJEKTKARTE ERZEUGEN
// ==========================================================
// Aufruf:  node tools/karte.js
//
// Erzeugt zwei Dateien:
//   ARCHITEKTUR.md   — Uebersicht: welche Datei wofuer da ist, wie gross sie ist
//   FUNKTIONEN.txt   — Nachschlagewerk: funktionsname -> datei:zeile
//
// Sinn: Wer (Mensch oder KI) etwas sucht, greppt FUNKTIONEN.txt und springt
// direkt an die Stelle, statt Dateien durchzulesen. Das spart bei einer
// Codebasis dieser Groesse sehr viel Sucherei.
//
// Nach groesseren Umbauten einfach neu laufen lassen.
// ==========================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'js');

// Kopfkommentar der Datei als Kurzbeschreibung verwenden
function beschreibung(text) {
    const zeilen = text.split(/\r?\n/).slice(0, 12);
    for (const z of zeilen) {
        const t = z.trim();
        if (!t.startsWith('//')) continue;
        const inhalt = t.replace(/^\/\/\s?/, '').trim();
        if (!inhalt || /^=+$/.test(inhalt)) continue;
        return inhalt;
    }
    return '';
}

// Funktionsdefinitionen einsammeln (bewusst per Regex: schnell, und es genuegt,
// weil die Codebasis durchgaengig window.x = function / function x schreibt)
const MUSTER = [
    /^\s*window\.([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?function/,
    /^\s*window\.([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/,
    /^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/,
    /^\s*(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?function/,
    /^\s*(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/
];

const dateien = fs.readdirSync(JS).filter(f => f.endsWith('.js')).sort();
const eintraege = [];
const uebersicht = [];

for (const datei of dateien) {
    const text = fs.readFileSync(path.join(JS, datei), 'utf8');
    const zeilen = text.split(/\r?\n/);
    const gefunden = [];
    zeilen.forEach((z, i) => {
        for (const m of MUSTER) {
            const t = m.exec(z);
            if (t) { gefunden.push({ name: t[1], zeile: i + 1 }); break; }
        }
    });
    gefunden.forEach(g => eintraege.push({ name: g.name, datei, zeile: g.zeile }));
    uebersicht.push({ datei, zeilen: zeilen.length, anzahl: gefunden.length, zweck: beschreibung(text) });
}

// --- ARCHITEKTUR.md ---
uebersicht.sort((a, b) => b.zeilen - a.zeilen);
const gesamt = uebersicht.reduce((s, u) => s + u.zeilen, 0);

let md = '# Projektkarte\n\n';
md += '> Erzeugt von `node tools/karte.js` — nicht von Hand pflegen.\n';
md += '> Funktion gesucht? `FUNKTIONEN.txt` durchsuchen, dort steht Datei und Zeile.\n\n';
md += '## JavaScript-Module\n\n';
md += Math.round(gesamt / 1000) + 'k Zeilen in ' + uebersicht.length + ' Dateien.\n\n';
md += '| Datei | Zeilen | Funktionen | Zweck |\n|---|--:|--:|---|\n';
uebersicht.forEach(u => {
    md += '| `js/' + u.datei + '` | ' + u.zeilen + ' | ' + u.anzahl + ' | ' + (u.zweck || '—') + ' |\n';
});

const css = [];
(function sammle(dir, prefix) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) sammle(path.join(dir, e.name), prefix + e.name + '/');
        else if (e.name.endsWith('.css')) {
            const n = fs.readFileSync(path.join(dir, e.name), 'utf8').split(/\r?\n/).length;
            css.push({ pfad: prefix + e.name, zeilen: n });
        }
    }
})(path.join(ROOT, 'css'), 'css/');
css.sort((a, b) => b.zeilen - a.zeilen);

md += '\n## Stylesheets\n\n| Datei | Zeilen |\n|---|--:|\n';
css.forEach(c => { md += '| `' + c.pfad + '` | ' + c.zeilen + ' |\n'; });

md += '\n## Hinweise\n\n';
md += '- Die Ladereihenfolge der Module in `index.html` entspricht der frueheren\n';
md += '  Reihenfolge im Inline-Code und darf nicht vertauscht werden.\n';
md += '- Neue js/css-Datei? Auch in die `PRECACHE`-Liste in `sw.js` eintragen.\n';
md += '- HTML gehoert in `partials/`, danach `node build.js`.\n';

fs.writeFileSync(path.join(ROOT, 'ARCHITEKTUR.md'), md, 'utf8');

// --- FUNKTIONEN.txt ---
eintraege.sort((a, b) => a.name.localeCompare(b.name));
let txt = '# Nachschlagewerk: Funktion -> Datei:Zeile\n';
txt += '# Erzeugt von "node tools/karte.js". Suchen statt lesen.\n';
txt += '# ' + eintraege.length + ' Eintraege\n\n';
let breite = Math.min(44, Math.max(...eintraege.map(e => e.name.length)) + 2);
eintraege.forEach(e => { txt += e.name.padEnd(breite) + ' js/' + e.datei + ':' + e.zeile + '\n'; });
fs.writeFileSync(path.join(ROOT, 'FUNKTIONEN.txt'), txt, 'utf8');

console.log('ARCHITEKTUR.md  — ' + uebersicht.length + ' JS-Dateien, ' + css.length + ' CSS-Dateien');
console.log('FUNKTIONEN.txt  — ' + eintraege.length + ' Funktionen');
