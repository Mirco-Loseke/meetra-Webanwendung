# Timeline-Ansicht wieder entfernen

Stand: 2026-09-02. Die Timeline ist bewusst so eingebaut, dass sie in wenigen
Minuten spurlos verschwindet. Sie schreibt **nichts** in die Datenbank, solange
der Schalter „Änderungen speichern" aus ist — und Spalten oder Tabellen hat sie
keine angelegt. Ein Rückbau kann also keine Daten verlieren.

## Der schnelle Weg

Im Ordner `_backups/timeline-integration-2026-09-02/` liegen die vier Dateien
in genau dem Zustand von **vor** dem Einbau. Zurückkopieren:

```bash
cp -r _backups/timeline-integration-2026-09-02/index.html .
cp -r _backups/timeline-integration-2026-09-02/sw.js .
cp -r _backups/timeline-integration-2026-09-02/js/app-init.js js/
cp -r _backups/timeline-integration-2026-09-02/partials/components/sidebar.html partials/components/
```

Danach die drei neuen Dateien löschen:

```bash
rm js/timeline-view.js css/views/timeline.css partials/views/timeline.html
```

Zum Schluss `CACHE_NAME` in `sw.js` **hochzählen** (nicht die alte Nummer
stehen lassen), sonst behalten die Browser die Fassung mit Timeline.

## Der Weg von Hand

Falls die Sicherungen inzwischen veraltet sind, weil an denselben Dateien
weitergearbeitet wurde — es sind nur sechs Stellen:

| Datei | Was raus muss |
|---|---|
| `partials/components/sidebar.html` | der `<li>`-Block mit `data-target="timeline"` |
| `index.html` | derselbe `<li>`-Block (Sidebar ist dort eingesetzt) |
| `index.html` | der Bereich `<!-- @partial:views/timeline.html -->` … `<!-- /@partial:views/timeline.html -->` |
| `index.html` | die `<link … css/views/timeline.css?v=…>`-Zeile |
| `index.html` | die `<script src="js/timeline-view.js?v=…">`-Zeile |
| `js/app-init.js` | `'timeline',` aus `window.PERM_VIEW_KEYS` |
| `sw.js` | `'css/views/timeline.css',` und `'js/timeline-view.js',` aus `PRECACHE`, dann `CACHE_NAME` hochzählen |

Neue Dateien löschen: `js/timeline-view.js`, `css/views/timeline.css`,
`partials/views/timeline.html`. Sonst wurde **nichts** angefasst.

## Nur ausblenden statt entfernen

Wer die Ansicht erstmal nur loswerden will, ohne Dateien anzufassen: in den
Einstellungen unter Benutzerverwaltung die Berechtigung `timeline` für alle
abwählen. Dann verschwindet der Menüpunkt, der Code bleibt liegen.

## Wichtig, falls doch weitergebaut wird

`node build.js` lässt sich auf diesem Rechner nicht ausführen (kein Node
installiert). Der Baustein `partials/views/timeline.html` und der eingesetzte
Bereich im `index.html` wurden deshalb **von Hand gleich gehalten**. Wer den
Baustein ändert, muss die Änderung entweder ebenfalls von Hand ins `index.html`
übertragen oder `node build.js` auf einem Rechner mit Node laufen lassen.
