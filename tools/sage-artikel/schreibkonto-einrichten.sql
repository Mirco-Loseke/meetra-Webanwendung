-- ==========================================================
-- Sage 100 (OLMeetra auf Meetra-SA) — eingeschränktes Schreibkonto
-- für die Artikel-Ergänzung (Lieferant, EK, Intern-Preis, Gewicht,
-- englischer Text, Lagerplatz). Auszuführen von einem SQL-Admin
-- in SQL Server Management Studio. Vorher Datenbank sichern.
--
-- Darf: alles lesen, nur die unten genannten Spalten ändern,
--       nur in 3 Tabellen neue Zeilen anlegen.
-- Darf NICHT: löschen, Artikel anlegen, Belege/Buchhaltung ändern,
--       Tabellen/Rechte ändern.
-- ==========================================================

-- 1) Anmeldung (Windows-Gruppe empfohlen; alternativ SQL-Login, siehe unten)
USE [master];
CREATE LOGIN [MEETRA\meetra-artikel-pflege] FROM WINDOWS WITH DEFAULT_DATABASE = [OLMeetra];
-- Alternative ohne AD-Gruppe (Passwort vom Admin vergeben, nicht per Mail verschicken):
-- CREATE LOGIN [meetra_artikel] WITH PASSWORD = N'<<vom Admin festlegen>>', CHECK_POLICY = ON, DEFAULT_DATABASE = [OLMeetra];
GO

USE [OLMeetra];
CREATE USER [meetra_artikel] FOR LOGIN [MEETRA\meetra-artikel-pflege];
-- bei SQL-Login: CREATE USER [meetra_artikel] FOR LOGIN [meetra_artikel];
GO

-- 2) Lesen
ALTER ROLE [db_datareader] ADD MEMBER [meetra_artikel];
GO

-- 3) Lieferant je Artikel: Bestellnummer, EK, Rabatt — neu anlegen + ändern
GRANT INSERT ON dbo.KHKArtikelLieferant TO [meetra_artikel];
GRANT UPDATE (Bestellnummer, Bezeichnung1, Bezeichnung2, Einkaufsmengeneinheit, PreiseinheitEK,
              Einzelpreis, Rabattsatz, Mindestbestellmenge, Wiederbeschaffungszeit)
    ON dbo.KHKArtikelLieferant TO [meetra_artikel];

-- 4) Englischer Text — neu anlegen + ändern
GRANT INSERT ON dbo.KHKArtikelBezeichnung TO [meetra_artikel];
GRANT UPDATE (Bezeichnung1, Bezeichnung2) ON dbo.KHKArtikelBezeichnung TO [meetra_artikel];

-- 5) Preislisten (1 = Standard-VK, 6 = Intern meetra) — neu anlegen + Preis ändern
GRANT INSERT ON dbo.KHKPreislistenArtikel TO [meetra_artikel];
GRANT UPDATE (Einzelpreis) ON dbo.KHKPreislistenArtikel TO [meetra_artikel];

-- 6) Gewicht + kalkulatorischer EK
GRANT UPDATE (Gewicht, KalkulatorischerEK) ON dbo.KHKArtikelVarianten TO [meetra_artikel];

-- 7) Standard-Lagerplatz am Artikel
GRANT UPDATE (PlatzID) ON dbo.KHKArtikel TO [meetra_artikel];
GO

-- Kontrolle: sollte genau die Rechte oben zeigen
SELECT OBJECT_NAME(major_id) AS Tabelle, COL_NAME(major_id, minor_id) AS Spalte, permission_name
FROM sys.database_permissions WHERE grantee_principal_id = USER_ID('meetra_artikel')
ORDER BY 1, 2;

-- Rückgängig machen:
-- USE [OLMeetra]; DROP USER [meetra_artikel];
-- USE [master];   DROP LOGIN [MEETRA\meetra-artikel-pflege];
