// ==========================================================
// Werkstattfotos: Modal zum Aufnehmen und Hochladen
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 7678-7734).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        // --- Workshop Photo Feature Logic ---

        window.currentWorkshopPhotoMachineId = null;
        window.workshopPhotosToUpload = [];
        window.workshopPhotoAppendEntryId = null; // Used when appending to existing entry

        window.openWorkshopPhotoModal = async function (machineId) {
            window.currentWorkshopPhotoMachineId = machineId;
            window.workshopPhotosToUpload = [];

            // UI Reset
            document.getElementById('workshop-new-photo-title').value = '';
            document.getElementById('workshop-new-photo-note').value = '';
            document.getElementById('workshop-new-photo-preview').innerHTML = '';
            document.getElementById('btn-save-workshop-photo').disabled = true;
            document.getElementById('workshop-photos-list').innerHTML = '<div style="color: rgba(255,255,255,0.5); font-size: 0.9rem;">Lade Fotos...</div>';

            const modal = document.getElementById('workshop-photo-modal');
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });

            if (!window.supabaseClient) return;

            try {
                // Fetch machine details
                const { data: machine } = await window.supabaseClient
                    .from('machines')
                    .select('name, internal_id')
                    .eq('id', machineId)
                    .single();

                if (machine) {
                    const fullName = [machine.manufacturer, machine.name, machine.serial_number || machine.serial ? `#${machine.serial_number || machine.serial}` : null, machine.year ? `(${machine.year})` : null].filter(Boolean).join(' ');
                    const nameDisplay = machine.internal_id ? `${fullName} (${machine.internal_id})` : fullName;
                    document.getElementById('workshop-photo-machine-name').innerText = nameDisplay;
                }

                await window.reloadWorkshopPhotosList();
            } catch (err) {
                console.error("Fehler beim Öffnen des Werkstatt-Foto Modals:", err);
            }
        };

        window.closeWorkshopPhotoModal = function () {
            const modal = document.getElementById('workshop-photo-modal');
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                window.currentWorkshopPhotoMachineId = null;
                window.workshopPhotosToUpload = [];
                window.workshopPhotoAppendEntryId = null;
            }, 300);
        };
