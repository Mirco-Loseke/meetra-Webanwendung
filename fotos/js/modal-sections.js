// ==========================================================
// Auf- und Zuklappen der Abschnitte in Maschinen- und Servicebericht-Modal
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 6567-6605).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
                    window.toggleMachineLocationGroup = function(forceHide) {
                        const group = document.getElementById('machine-location-address-group');
                        const btn = document.getElementById('btn-toggle-machine-location');
                        if (!group) return;
                        const isVisible = group.style.display !== 'none';
                        const hide = forceHide || isVisible;
                        group.style.display = hide ? 'none' : 'block';
                        if (btn) btn.textContent = hide ? '+ Abweichenden Maschinenstandort hinzufügen' : '− Abweichenden Maschinenstandort entfernen';
                        if (hide) {
                            ['machine-location-company','machine-location-street','machine-location-zip','machine-location-city','machine-location-country','machine-location-customer-id'].forEach(id => {
                                const el = document.getElementById(id);
                                if (el) el.value = '';
                            });
                        }
                    };

                    function toggleAddMachineSection(header) {
                        const content = header.nextElementSibling;
                        const chevron = header.querySelector('.toggle-chevron');
                        const isHidden = content.style.display === 'none';

                        content.style.display = isHidden ? 'block' : 'none';
                        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
                    }

                    function toggleServiceReportSection(headerOrId, forceState) {
                        let header = typeof headerOrId === 'string' ? document.getElementById(headerOrId) : headerOrId;
                        if (!header) return;
                        const content = header.nextElementSibling;
                        const chevron = header.querySelector('.toggle-chevron');
                        if (!content) return;
                        const isHidden = content.style.display === 'none';
                        const show = forceState !== undefined ? forceState : isHidden;

                        content.style.display = show ? 'block' : 'none';
                        if (chevron) {
                            chevron.style.transform = show ? 'rotate(180deg)' : 'rotate(0deg)';
                        }
                    }
