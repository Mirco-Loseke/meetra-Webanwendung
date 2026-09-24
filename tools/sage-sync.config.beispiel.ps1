# Kopie dieser Datei als sage-sync.config.ps1 anlegen und ausfuellen.
# SyncToken = derselbe Wert wie das Supabase-Secret SAGE_SYNC_TOKEN
# (Anleitung: supabase/SETUP_SAGE_SYNC.txt). Einen Service-Key braucht das Skript NICHT.
$SupabaseUrl = 'https://rtnpyziwyaqrlfazxkyr.supabase.co'
$SyncToken   = 'HIER_DEN_SYNC_TOKEN_EINTRAGEN'

# Optional: Ordner, aus dem Angebots-PDFs an die Angebote gehaengt werden.
# UNC-Pfad (\Server\Freigabe\...), KEIN Laufwerksbuchstabe wie S: - die
# geplante Aufgabe laeuft ohne die Laufwerkszuordnungen eines Benutzers.
# $AngebotePdfOrdner = '\SERVER\FREIGABE\Import & Backups meetra Webseite\Angebote'
