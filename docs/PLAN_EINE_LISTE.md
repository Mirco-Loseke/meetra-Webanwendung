# Plan „Eine Liste“ (Stand 2026-10-16)

**Problem (gemessen am 16.10.):** Sieben Stellen zeigen, was zu tun ist, mit sechs verschiedenen Zahlen.
- Glocke 0: alle Kategorien seit 29.09. ausgeschaltet, Tabelle `notification_preferences`.
- Startseite 12: die zwölf ältesten Einträge.
- To-do 9: davon 3 unter „Jetzt dran“, ganz andere Einträge als auf der Startseite.
- Vorgänge-Erinnerungen 25.
- Vorgänge-Kachel „> 7 Tage offen“ 25.
- Angebots-Glocke in den Listen 35.
- Dazu Wecker und Übergabe-Quittung.

Startseite und To-do hatten keinen gemeinsamen Eintrag. Drei Module fragen fast dasselbe getrennt ab:
- `collectImportantItems` in `notifications.js`
- `cockpit.js`
- `autoPruefen` in `todo-liste.js`

Entwurf mit Bildern: `tools/eine-liste-vorschau.html`, `tools/vorschau-bilder/eine-liste-*`.

## Entschieden (mit dem Nutzer)
- **Eine** Berechnung, z. B. `js/dran.js` mit `window.dranListe()`. Startseite, Liste, Vorgänge-Filter und Pop-ups lesen alle daraus.
- **Eine** rote Zahl am Knopf „Meine Liste“, dem heutigen To-do-Knopf. Auf dem Handy sitzt er in der Leiste unten.
- **„Jetzt“** = Termine heute, heute fällig, überfällig bis 7 Tage (älteste zuerst) und neu Zugewiesenes. Nur das zählt in die rote Zahl.
- Älter als 7 Tage → „Liegengeblieben“. Das ist zugeklappt, aber sichtbar, mit „Neues Datum / Erledigt / Abgeben“. Es geht nichts verloren.
- Weg ist ein Eintrag nur, wenn er wirklich erledigt ist. Kein „gelesen“ pro Browser mehr.
- Die Startseite zeigt die ersten 5 der Liste, mit derselben Zahl und Reihenfolge. „Demnächst“ bleibt als Vorschau ohne Zahl.
- Glocke oben, Erinnerungen-Block bei Vorgänge und Angebots-Glocke in den Listen fallen weg.
  - Zuweisungen und Einladungen stehen als NEU in der Liste.
  - Bei Vorgänge kommt dafür der Filter „Fällig für mich“.
- **Drucken (Wunsch Nutzer):** die ganze Liste aufs Blatt, mit allen Abschnitten, Kästchen und Platz für Notizen, zum Arbeiten per Hand. Der vorhandene To-do-Druck (`todo-liste.js`, ~Z. 1002) wird darauf umgestellt.
- **Pop-up-Meldungen bleiben (Wunsch Nutzer).** Sie zeigen dieselben Einträge wie die Liste. Die Übergabe-Quittung bleibt.

## Erledigt (2026-10-17)
- **Druck kompakt** (`js/kalender-todo-druck.js`): Nr., Kästchen, nächster Schritt fett mit eigenem Kästchen, Notizspalte — 30 Vorgänge ≈ 2 Blatt. Gilt schon für den heutigen To-do- und Kalender-Druck.
- **Pop-ups nach Art** (Erinnerung/Termin bernstein, Für dich blau, Info grün + selbstschließend), je Art abschaltbar (Zahnrad neben „Jetzt nicht“ + Einstellungen → Für dich → Benachrichtigungen). Details in `CLAUDE.md` → „Meldungs-Arten“.

## Noch offen — mit dem Nutzer klären
- **Pop-ups:** Arten und Farben sind gebaut (siehe oben). Offen: sollen beim Bau von „Eine Liste“ neue Arten dazukommen (z. B. „NEU in der Liste“), und wie oft dürfen sie sich wiederholen?
- Sollen die Glocken-Einstellungen (`notification_preferences`) in Pop-up-Einstellungen umgewidmet werden?
- Die Grenze „7 Tage“ ist fest. Soll sie je Benutzer einstellbar werden?

## Umsetzung (wenn freigegeben)
1. `js/dran.js`: eine schmale, serverseitig gefilterte Abfrage mit Realtime für die geänderte Zeile (Egress-Regeln in `CLAUDE.md` beachten). Die drei Doppel-Abfragen fallen weg.
2. To-do-Liste auf `dranListe()` umbauen, mit den Abschnitten Jetzt / Diese Woche / Liegengeblieben / Eigene Notizen. Den Druck anpassen.
3. Cockpit „Jetzt zuerst“ auf `dranListe().slice(0,5)` umstellen.
4. Glocke, Erinnerungen-Block und Angebots-Glocke entfernen. Den Filter „Fällig für mich“ bei Vorgänge einbauen.
5. Pop-ups (Wecker) auf `dranListe()` umstellen, nach der Klärung oben.
