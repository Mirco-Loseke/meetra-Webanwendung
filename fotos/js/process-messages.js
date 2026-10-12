// ==========================================================
// Vorgaenge: Nachrichten-/Screenshot-Dateien verarbeiten
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 15529-15668).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        function formatDateToLocalInput(date) {
            if (!date) date = new Date();
            const tzOffset = date.getTimezoneOffset() * 60000;
            return (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
        }

        // ==========================================
        // .MSG FILE IMPORT (Outlook Message Format)
        // ==========================================
        window.handleMsgFileDrop = function(event, prefix) {
            event.preventDefault();
            event.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            event.currentTarget.style.background = 'transparent';
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            if (file) window.processMsgFile(file, prefix || 'email');
        };

        window.handleMsgFileSelect = function(event, prefix) {
            const file = event.target.files && event.target.files[0];
            if (file) window.processMsgFile(file, prefix || 'email');
            event.target.value = '';
        };

        // Header dropzone (Vorgänge view): drop a .msg file to open the import modal pre-filled
        window.handleProcessHeaderMsgDrop = function(event) {
            event.preventDefault();
            event.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
            event.currentTarget.style.background = 'transparent';
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            if (!file) return;
            window.openEmailImportModal();
            window.processMsgFile(file, 'email');
        };

        window.handleProcessHeaderMsgSelect = function(event) {
            const file = event.target.files && event.target.files[0];
            if (file) {
                window.openEmailImportModal();
                window.processMsgFile(file, 'email');
            }
            event.target.value = '';
        };

        window.processMsgFile = function(file, prefix) {
            prefix = prefix || 'email';

            if (!file.name.toLowerCase().endsWith('.msg')) {
                window.showToast('Bitte eine .msg-Datei auswählen (Outlook-Nachricht).');
                return;
            }

            const MsgReaderClass = window.MSGReaderClass;
            if (!MsgReaderClass) {
                window.showToast('MSG-Reader Bibliothek konnte nicht geladen werden.');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const msgReader = new MsgReaderClass(e.target.result);
                    const fileData = msgReader.getFileData();

                    if (fileData.subject) {
                        document.getElementById(`${prefix}-title-input`).value = fileData.subject;
                    }

                    // Sender
                    let sender = '';
                    if (fileData.senderName && fileData.senderEmail) {
                        sender = `${fileData.senderName} <${fileData.senderEmail}>`;
                    } else {
                        sender = fileData.senderEmail || fileData.senderName || '';
                    }
                    if (sender) document.getElementById(`${prefix}-sender-input`).value = sender;

                    // Recipients (To)
                    const toRecipients = (fileData.recipients || [])
                        .filter(r => !r.recipType || r.recipType.toLowerCase() === 'to')
                        .map(r => (r.name && r.email) ? `${r.name} <${r.email}>` : (r.email || r.name))
                        .filter(Boolean);
                    if (toRecipients.length > 0) {
                        document.getElementById(`${prefix}-recipient-input`).value = toRecipients.join('; ');
                    }

                    // Body
                    const body = (fileData.body || '').trim();
                    if (body) document.getElementById(`${prefix}-body-input`).value = body;

                    // Date
                    const dateRaw = fileData.messageDeliveryTime || fileData.creationTime || fileData.lastModificationTime;
                    if (dateRaw) {
                        const d = new Date(dateRaw);
                        if (!isNaN(d.getTime())) {
                            document.getElementById(`${prefix}-date-input`).value = formatDateToLocalInput(d);
                        }
                    }

                    // Auto determine incoming or outgoing
                    if (sender && (sender.toLowerCase().includes('meetra') || sender.toLowerCase().includes('birco') || sender.toLowerCase().includes('info@') || sender.toLowerCase().includes('sales@'))) {
                        document.getElementById(`${prefix}-type-select`).value = 'email_outgoing';
                    } else {
                        document.getElementById(`${prefix}-type-select`).value = 'email_incoming';
                    }
                    window.syncProcessSelectDisplay(prefix, 'type');
                    window.updateEmailBodyVisibility(prefix);

                    // Smart matching trigger
                    const senderEmail = fileData.senderEmail || '';
                    const matchText = body + ' ' + (fileData.subject || '');
                    if (senderEmail) {
                        window.runSmartCustomerMatching(senderEmail, matchText, prefix);
                    } else {
                        window.runSerialNumberMatching(matchText, null, prefix);
                    }
                } catch (err) {
                    console.error('Error parsing .msg file:', err);
                    window.showToast('Fehler beim Lesen der .msg-Datei: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        };

        window.filterMachinesForCustomer = function(customerId, customerName, modalType) {
            const prefix = (modalType === 'import') ? 'email' : 'edit-process';
            const machines = (window.machineList || []).filter(m => String(m.customer_id) === String(customerId));

            window.processMachineRecommended[prefix] = machines.map(m => m.id);

            const hidden = document.getElementById(`${prefix}-machine-select`);
            if (machines.length > 0 && hidden && !hidden.value) {
                const m = machines[0];
                window.selectProcessMachine(prefix, m.id, window.processMachineLabel(m));
            }
        };

        // ==========================================
        // PROCESS MACHINE SEARCH DROPDOWN (Email-Import / Vorgang bearbeiten)
        // ==========================================
