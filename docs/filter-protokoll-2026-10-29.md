# Filter-Katalog: Protokoll und Auswertung (2026-10-29)
Quelle: Excel „Betriebskosten 2009 Spezial BNA“ (Blatt Werte, je Maschine 15.30–17.60). Sage: Tabelle KHKArtikel, nur gelesen. Eingetragen in `machine_filters`.

## Vorgehen
1. Je Maschine die Filter aus Excel gelesen (Nr., Bezeichnung, Original-Nr., Menge, Schutzbelüftungs-Typ).
2. Original-Nr. in Sage gesucht (Bezeichnung 1/2, Matchcode, Herstellernr., Alt.-Lieferantennr.; ohne Leerzeichen/Bindestriche verglichen). Nur eindeutige Treffer übernommen.
3. Je Motor-Gruppe eingetragen; gleiche Filter bei mehreren Motoren nur einmal, Motortyp ergänzt.
4. Mengen aus Excel übernommen. Ventildeckeldichtungen und Hydraulikfilter bewusst nicht übernommen.

## Motor-Gruppen (neue Namen)
DEUTZ BF 4L 1011 F (15.30) · CUMMINS QSB (15.40) · CUMMINS 6CTA 8.3 (15.50) · CUMMINS QSC (16.40/16.43/16.50/16.55) · CUMMINS QSB III (16.43 III, 17.43) · CUMMINS QSX (16.60) · CUMMINS QSL III (17.50–17.60) · YANMAR 4TNV88 (16.30) · CUMMINS 4BT 4.5 (16.36)

## Sage gefunden
FS 19519→00000674 · P77-7409→00000662 · P77-7414→00000658 · LF 9009→00001228 · FS 1022→00000666 · BS60→00000665 · FF5421→00003926 · FS19732→00000667 · P77 78 68→00001280 · P77 78 69→00000661 · LF3805→00003681 · P78-0522→00003677 · P78-0523→00003678 · P55-3000→00000007 · H60WK01→00000672
**Prüfen:** FS19608→00003679 (Sage „P550899 Kraftstoffwechselfilter“, nur Querverweis).

## Sage NICHT gefunden (Artikel anlegen oder Nummer klären)
0117 4416, 0117 4696, C 17 201, CF 820 (alle DEUTZ 15.30) · LF 3970 (QSB/QSB III) · LF 9000, FS 1007, WF 2126 (QSX) · FS5580 (QSL III) · Grobstaubfilter G4 350x250x25 · alle Filter des YANMAR 4TNV88 (Excel ohne Original-Nr.) · alle Keilriemen

## Motortyp der Maschinen in der DB passt nicht
17.50/17.55/17.60 ohne Motortyp; 16.43 „QSB5.9-C205“ (Excel: QSC); 17.55 „CUMMINS QSL 8.9“, 16.55 „CUMMINS QSL 90R250“ (Filter heißen QSL III / QSC); 17.50/17.55/16.55 mit „CUMMINS QSC 8.3“ — Excel sagt QSL III bzw. QSC. Nur 15.50, 16.36 und die QSC-8.3-Maschinen bekommen Filter angezeigt.

## Internet-Alternativnummern
Noch nicht ergänzt (nur 1:1-austauschbare, belegte Nummern).

## Nachtrag: 5er und 6er (Deutz/QSX)
Motor-Gruppen: DEUTZ BF 6M 1013 (5.40), DEUTZ BF 6M 1013 CP (5.45/5.50), DEUTZ BF 6M 1015 C (5.60), DEUTZ BF 8M 1015 C (5.70/5.75), CUMMINS QSX (6.60/6.65/6.70/6.75), CUMMINS QSX III (6.65 III/6.70 III/6.75 III).
Sage: für alle Deutz-Nummern (0117 4421/4420/4422, 0118 0597, 0216 5054/5059, 0224 3946, 0414 4966, C 33920/3, CF 2100) und FS 1041 **kein Treffer**; QSX-Luftfilter P77 78 68/69 gefunden.
Schutzbelüftung nicht für QSX III (Excel-Typ abweichend: 6.65 III nur Filtermatte). Mengen bei QSX/Luftfilter teils 2 statt 1 (gemeinsame Zeile mit QSC/QSL, dort 1) – bitte prüfen.
Motorliste (app_settings `motor_typen`) enthält alle Gruppennamen.

## Nachtrag 2: Motoren zusammengeführt, Hydraulik, Arjes
- **Motortypen:** `CUMMINS QSC` → `CUMMINS QSC 8.3`; `CUMMINS QSL III` und `CUMMINS QSL 90R250` → `CUMMINS QSL 8.9` (19 Filterzeilen, Maschine 16.55 auf QSL 8.9 gesetzt, Motorliste bereinigt).
- **Hydraulik/Hochdruck** je Motor aus der Excel: V3.0923-08 → 00001281, HD 040-110 → 00000695, HD 081-111 → 00000694, HD 150-50 → 00001232. **Ohne Sage:** 8.7SL130P10 (Deutz, 6CTA, QSX).
- **Arjes Impaktor 350 EVO II (TAD583VE) und 250 EVO II (TAD581):** gleiche 9 Filter; Motor `VOLVO Penta TAD581` an den Zeilen ergänzt. Sage: P954869 → 00000718, P956170 → 00000717, P959849 → 00002179, R2.0922-06 → 00004732. **Ohne Sage:** SO 7327, SD 70490, E106U, P553227, C 26 980.
- **Intervalle aus Betriebsanleitung (Seiten 118/119/134):** Motorölfilter, Kraftstofffilter, Hydraulikfilter (Saug-Rücklauf), 3 Harnstofffilter: alle 500 Std. oder halbjährlich; Luftfilter-Hauptelement: mindestens halbjährlich. Sicherheitselement (alle 2 Jahre) ist keine eigene Zeile.
- **Gruppen / Ziehen:** Spalten `gruppe`, `sortierung` (Migration `supabase_add_filter_gruppen.sql`, MUSS laufen).
