// ==========================================
// BAUSTEINE INS index.html EINSETZEN
// ==========================================
// Aufruf:   node build.js
//
// Die Ansichten, Einstellungsseiten und Modals werden in partials/ gepflegt.
// Dieses Skript schreibt deren aktuellen Inhalt in das index.html — zwischen
// die Marker:
//
//     <!-- @partial:views/calendar.html -->
//     ... Inhalt ...
//     <!-- /@partial:views/calendar.html -->
//
// Es wird kein Markup zur Laufzeit nachgeladen. Das ist Absicht: die App wird
// auch per Doppelklick direkt aus dem Ordner geöffnet (file://), und dabei
// verbietet der Browser jedes Nachladen weiterer Dateien.
//
// Das Skript ist beliebig oft wiederholbar — es ersetzt immer nur den Bereich
// zwischen den Markern.
// ==========================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const INDEX = path.join(ROOT, 'index.html');

const html = fs.readFileSync(INDEX, 'utf8');
const marker = /([ \t]*)<!-- @partial:([^ ]+?) -->[\s\S]*?<!-- \/@partial:\2 -->/g;

let count = 0;
const missing = [];

const out = html.replace(marker, (full, indent, file) => {
    const p = path.join(ROOT, 'partials', file);
    if (!fs.existsSync(p)) { missing.push(file); return full; }

    // Baustein auf die Einrückung der Fundstelle bringen
    const body = fs.readFileSync(p, 'utf8')
        .replace(/\s+$/, '')
        .split(/\r?\n/)
        .map(l => (l.trim() ? indent + l : l))
        .join('\n');

    count++;
    return `${indent}<!-- @partial:${file} -->\n${body}\n${indent}<!-- /@partial:${file} -->`;
});

if (missing.length) {
    console.error('Diese Bausteine fehlen in partials/:\n  ' + missing.join('\n  '));
    process.exit(1);
}

if (out !== html) {
    fs.writeFileSync(INDEX, out, 'utf8');
    console.log(`${count} Bausteine ins index.html eingesetzt.`);
} else {
    console.log(`${count} Bausteine geprüft — index.html ist bereits aktuell.`);
}
