// ==========================================================
// Sage 100 — Artikel-Import-Datei aus einer Prüfliste erzeugen
// ==========================================================
// Liest <name>.json (Liste neuer Artikel + Lieferanten-Zuordnungen) und schreibt
//   <name>.xml               → Sage: Artikel importieren (Format wie Article.xml)
//   <name>_lieferanten.csv   → Lieferant/Bestellnr./EK/Rabatt je Artikel
// Aufruf: node tools/sage-artikel/artikel-xml.js tools/sage-artikel/<name>.json
// ==========================================================
const fs = require('fs');

const quelle = process.argv[2];
if (!quelle) { console.error('Aufruf: node artikel-xml.js <datei.json>'); process.exit(1); }
const daten = JSON.parse(fs.readFileSync(quelle, 'utf8'));
const basis = quelle.replace(/\.json$/i, '');

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const zahl = n => String(Math.round(Number(n) * 10000) / 10000).replace('.', ',');
const tag = (name, wert) => (wert === undefined || wert === null || wert === '') ? `<${name} />` : `<${name}>${esc(wert)}</${name}>`;

function gruppen(cat) {
    const teile = cat.split('.').filter(Boolean);
    return { main: teile[0] + '.', parent: teile.length > 1 ? teile.slice(0, -1).join('.') + '.' : teile[0] + '.' };
}

function artikelXml(a) {
    const g = gruppen(a.gruppe);
    return `   <ARTICLE>
${tag('ARTID', a.nr)}
${tag('MATCH', a.match || a.bez1)}
${tag('DESC1', a.bez1)}
${tag('DESC2', a.bez2)}
${tag('MEMO', a.memo)}
<DESCDIM />
<DESCDIMHTML />
<LDESCLONG />
<LDESCLONGHTML />
<LDESCLONGRTF />
<DESCDIMRTF />
<BASICME>${esc(a.einheit || 'Stk')}</BASICME>
<DECIMALBASIC>0</DECIMALBASIC>
<SUBSTITUTENR />
<FORMULAVK />
<DECIMALVK>0</DECIMALVK>
<CONVERSIONVK>1</CONVERSIONVK>
<PACKINGUNITVK />
<CONVERSIONVPVK>1</CONVERSIONVPVK>
<PRICEUNITVK>1</PRICEUNITVK>
<DECIMALPRICE>2</DECIMALPRICE>
<ELIFORVK>-1</ELIFORVK>
<DISCGROUP />
${tag('PROD', a.hersteller)}
<TAXRATE>16</TAXRATE>
<TAXBRACK>1</TAXBRACK>
${tag('CAT', a.gruppe)}
${tag('CATMAIN', g.main)}
${tag('CATPARENT', g.parent)}
<QUANTUNIT />
<STOCKUNIT>${esc(a.einheit || 'Stk')}</STOCKUNIT>
<STOCKUNITCONVERSION>1</STOCKUNITCONVERSION>
<STOCKUNITDECIMALS>0</STOCKUNITDECIMALS>
<ELIFORDISC>-1</ELIFORDISC>
<FAVORIT>0</FAVORIT>
${tag('HARTID', a.herstellerNr)}
<INSTORE>-1</INSTORE>
<LENGTH>0</LENGTH>
<WIDTH>0</WIDTH>
<HEIGHT>0</HEIGHT>
<CURRFORWEB>EUR</CURRFORWEB>
<ONEUSE>0</ONEUSE>
<GPUNIT />
<GPCONVERSION>1</GPCONVERSION>
<GPBASIC>1</GPBASIC>
<VARIANT />
<ARTTYPE>0</ARTTYPE>
<RESSOURCEREF />
<PARTSTYPE>0</PARTSTYPE>
<CUSTTAX>0</CUSTTAX>
<SERIALNUMBERDUTY>0</SERIALNUMBERDUTY>
<CHARGEDUTY>0</CHARGEDUTY>
<PROVISIONABLE>-1</PROVISIONABLE>
<CUSTOMERCARD>-1</CUSTOMERCARD>
<SUPPLIERCARD>-1</SUPPLIERCARD>
<CASHDISCOUNT>-1</CASHDISCOUNT>
<DESCLIST>
<LANGUAGE>E</LANGUAGE>
${tag('LDESC1', a.bez1En)}
${tag('LDESC2', a.bez2En)}
<LDESCDIM />
<LDESCDIMHTML />
<LDESCDIMRTF />
<LDESCLONG />
<LDESCLONGHTML />
<LDESCLONGRTF /></DESCLIST>
<ARTVARIANT>
<ARTVARID>0</ARTVARID>
${tag('EANNR', a.ean)}
<WEIGHT>${zahl(a.gewicht || 0)}</WEIGHT>
<WEIGHTSTOCKUNIT>0</WEIGHTSTOCKUNIT>
<SUPPLAVAILABLE>1</SUPPLAVAILABLE>
<WBTIME>0</WBTIME>
<EARREPORTINGMODE>0</EARREPORTINGMODE>
<EARWEIGHT>0</EARWEIGHT>
<EARREGNR />
<EARMANUFACTURER />
<EARCATEGORY />
<EARDEVICETYPE />
<EARPRODUCTGROUP />
<LISTPRICE>
<FROMQUANT>0</FROMQUANT>
<PRICE>${zahl(a.vk)}</PRICE>
<DISC>0</DISC></LISTPRICE></ARTVARIANT></ARTICLE>
`;
}

const xml = `<!DOCTYPE ARTICLES SYSTEM "Article.dtd"[]>
<ARTICLES>
   <PRICELISTID>1</PRICELISTID>
   <DISCLISTID>0</DISCLISTID>
   <CURRENCY>EUR</CURRENCY>
${daten.artikel.map(artikelXml).join('')}</ARTICLES>
`;
fs.writeFileSync(basis + '.xml', xml, 'utf8');

// Spaltennamen wie in KHKArtikelLieferant, damit die Zuordnung im Sage-Importassistenten 1:1 passt
const kopf = ['Lieferant', 'Artikelnummer', 'Bestellnummer', 'Bezeichnung1', 'Einkaufsmengeneinheit', 'PreiseinheitEK', 'Einzelpreis', 'Rabattsatz'];
const zeilen = daten.lieferanten.map(l => [l.lieferant, l.nr, l.bestellnr, l.bez || '', l.einheit || 'Stk', 1, zahl(l.ek), zahl(l.rabatt || 0)]
    .map(v => String(v).replace(/;/g, ',')).join(';'));
fs.writeFileSync(basis + '_lieferanten.csv', Buffer.from([kopf.join(';'), ...zeilen].join('\r\n') + '\r\n', 'latin1'));

console.log(`${daten.artikel.length} Artikel → ${basis}.xml`);
console.log(`${daten.lieferanten.length} Lieferanten-Zeilen → ${basis}_lieferanten.csv`);
