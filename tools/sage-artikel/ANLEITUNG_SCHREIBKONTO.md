# Sage 100 – eingeschränktes Schreibkonto für die Artikelpflege

**An:** IT / Sage-Partner  **Von:** Mirco Loseke, meetra  **Stand:** 28.10.2026

## Worum es geht
Neue Artikel legen wir über den Sage-Datenaustausch an (Administration → Datenaustausch → Import → Artikel, XML).
Dieses Format kennt aber **keine** Lieferanten, EK-Preise, Rabatte, zweite Preisliste und keine Lagerplätze
(siehe `Sage 100\9.0\Addin\Article.dtd`) und kann **vorhandene Artikel nicht ändern**.
Diese Felder sollen deshalb per kleinem Skript direkt in der Datenbank ergänzt werden – immer mit Sicherung vorher
und Vergleich nachher, und nur nach Freigabe durch uns.

Dafür brauchen wir ein Konto, das **nur diese Felder** schreiben darf.

## Umgebung
- SQL Server 2019, Instanz `Meetra-SA`, Datenbank `OLMeetra`, Mandant 1
- Lesen klappt heute schon per Windows-Anmeldung.

## Benötigte Rechte (minimal)
| Tabelle | Recht | Spalten / Zweck |
|---|---|---|
| alle | lesen | `db_datareader` |
| `KHKArtikelLieferant` | INSERT, UPDATE | Bestellnummer, Bezeichnung, EK-Einheit, Einzelpreis (EK), Rabattsatz, Mindestmenge, WBZ |
| `KHKArtikelBezeichnung` | INSERT, UPDATE | englischer Text (Sprache `E`): Bezeichnung1/2 |
| `KHKPreislistenArtikel` | INSERT, UPDATE | Einzelpreis in Liste 1 (Standard) und 6 (Intern meetra) |
| `KHKArtikelVarianten` | UPDATE | Gewicht, KalkulatorischerEK |
| `KHKArtikel` | UPDATE | PlatzID (Standard-Lagerplatz) |

**Kein** DELETE, kein Anlegen von Artikeln, keine Belege, keine Buchhaltung, keine Schemaänderungen.

## Einrichten
Skript: [`schreibkonto-einrichten.sql`](schreibkonto-einrichten.sql) – in SSMS als SQL-Admin ausführen.
Vorher anpassen:
1. Domäne/Gruppe in `MEETRA\meetra-artikel-pflege` auf eure echte AD-Gruppe ändern (empfohlen) und
   Mirco Loseke dort aufnehmen – **oder** die SQL-Login-Variante nutzen (Passwort vergibt der Admin).
2. Vorher eine Datenbanksicherung ziehen.
3. Die Kontrollabfrage am Ende zeigt die vergebenen Rechte. Rückgängig: zwei `DROP`-Zeilen am Ende.

## Fragen an den Sage-Partner
Auf den Tabellen liegen Sage-Trigger (aktiv: `TRI/TRU_Artikel`, `TRI/TRU_PreislistenArtikel`,
`TRD_ArtikelVarianten`; auf `KHKArtikelLieferant` alle deaktiviert). Bitte kurz bestätigen:
1. Sind direkte INSERT/UPDATE auf diese Felder unkritisch (keine Pflicht-Folgetabellen, kein Cache, der neu aufgebaut werden muss)?
2. Muss bei neuem Lieferanten-Eintrag noch etwas anderes gesetzt werden (z. B. Hauptlieferant, `LetzterLieferant`)?
3. `KHKPreislistenArtikel.ID` ist Identity – reicht ein INSERT ohne ID mit `IstStaffelPreis = 0`?

## Sicherheitsnetz im Ablauf
- Vor jeder Änderung: komplette Sicherung der betroffenen Artikelzeilen als Datei (`tools/sage-artikel/sicherung/`).
- Es werden nur **leere** Felder gefüllt bzw. neue Lieferanten-Zeilen angelegt; vorhandene Werte werden nicht überschrieben, außer ausdrücklich freigegeben.
- Nach jeder Änderung: Feld-für-Feld-Vergleich gegen die Sicherung.
- Erster Lauf: genau **ein** Testartikel (00001986).
