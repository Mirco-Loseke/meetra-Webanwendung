// ==========================================================
// PDF-Erzeugung des Serviceberichts (jsPDF) inkl. Vorschau und Ablage in R2
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 5887-7378).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        window.generateServiceberichtPDFDoc = async function() {
            try {
                if (typeof window.loadPDFGenerators === 'function') {
                    await window.loadPDFGenerators();
                }
                if (typeof window.loadUnicodePdfFont === 'function') {
                    try { await window.loadUnicodePdfFont(); } catch (e) { console.warn('Unicode-Schriftart fuer PDF konnte nicht geladen werden, Sonderzeichen koennten falsch dargestellt werden:', e); }
                }

                // Load background template
                let bgImage = null;
                if (window.VORLAGE_BASE64) {
                    bgImage = window.VORLAGE_BASE64;
                } else {
                    try {
                        const res = await fetch('assets/images/vorlage_bg.jpg');
                        if (res.ok) {
                            const blob = await res.blob();
                            bgImage = await new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });
                        }
                    } catch(e) { console.warn('Could not load background template:', e); }
                }

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                if (typeof window.registerUnicodeFont === 'function' && window.registerUnicodeFont(doc)) {
                    doc.setFont('helvetica', 'normal');
                }

                // Helper to add background
                const addBackground = () => {
                    if (bgImage) {
                        doc.addImage(bgImage, 'JPEG', -5, -5, 220, 307, undefined, 'FAST');
                    }
                };

                // Overlay doc.addPage
                const originalAddPage = doc.addPage.bind(doc);
                doc.addPage = function () {
                    originalAddPage();
                    addBackground();
                    return doc;
                };
                
                // Initial page background
                addBackground();

                // Get values
                const machineId = document.getElementById('selected-machine-id').value;
                const dateStart = document.getElementById('service-date-start').value;
                const dateEnd = document.getElementById('service-date-end').value;
                const description = document.getElementById('service-description').value;
                const remarks = document.getElementById('service-remarks')?.value || '';
                const travelDistance = document.getElementById('service-driving-distance').value;
                const travelTime = document.getElementById('service-driving-time').value;
                const signature = document.getElementById('service-customer-signature').value;
                const signatureName = document.getElementById('service-customer-signee-name').value.trim();
                const techSignature = document.getElementById('service-tech-signature')?.value || '';
                
                // Get machine detail
                const machine = (window.machineList || []).find(m => m.id == machineId);
                const machineTitle = machine ? `${machine.manufacturer || ''} ${machine.name || ''}`.trim() : 'Unbekannte Maschine';
                const serialNumber = machine ? (machine.serial || machine.serial_number || '-') : '-';
                
                // Get customer detail
                // Get customer detail
                let customerName = machine ? (machine.company || 'Unbekannter Betreiber') : 'Unbekannter Betreiber';
                let customerNumber = machine ? (machine.customer_number || '') : '';
                let opStreet = machine ? (machine.operator_street || '') : '';
                let opZip = machine ? (machine.operator_zip || '') : '';
                let opCity = machine ? (machine.operator_city || '') : '';
                let opCountry = machine ? (machine.operator_country || 'Deutschland') : 'Deutschland';
                let cust = null;

                if (machine && machine.customer_id) {
                    try {
                        const { data } = await window.supabaseClient
                            .from('customers')
                            .select('customer_number, name, street, zip_code, city, country')
                            .eq('id', machine.customer_id)
                            .single();
                        if (data) {
                            cust = data;
                            // Manuell bearbeitete Betreiber-/Rechnungsadresse der Maschine hat Vorrang vor den Sage-Stammdaten
                            if (!machine.company) customerName = cust.name || customerName;
                            if (!customerNumber && cust.customer_number) customerNumber = cust.customer_number;
                            if (!opStreet) opStreet = cust.street || '';
                            if (!opZip) opZip = cust.zip_code || '';
                            if (!opCity) opCity = cust.city || '';
                            if (!machine.operator_country) opCountry = cust.country || 'Deutschland';
                        }
                    } catch(e){}
                }

                // Operator lines
                let operatorLines = [];
                if (customerNumber) {
                    operatorLines.push(`Kundennummer: ${customerNumber}`);
                }
                operatorLines.push(customerName);
                if (opStreet) operatorLines.push(opStreet);
                if (opZip || opCity) {
                    operatorLines.push([opZip, opCity].filter(Boolean).join(' '));
                }
                if (opCountry && !['de', 'deutschland', 'germany'].includes(opCountry.trim().toLowerCase())) operatorLines.push(opCountry);
                
                // Get machine's construction year
                const machineYear = machine ? (machine.year || '-') : '-';
                
                // Check and build location address
                const locCompanyVal = document.getElementById('service-location-company')?.value.trim() || '';
                const locStreetVal = document.getElementById('service-location-street')?.value.trim() || '';
                const locZipVal = document.getElementById('service-location-zip')?.value.trim() || '';
                const locCityVal = document.getElementById('service-location-city')?.value.trim() || '';
                const locCountryVal = document.getElementById('service-location-country')?.value.trim() || 'Deutschland';
                
                const isDefaultCountry = (c) => !c || ['de', 'deutschland', 'germany'].includes(c.trim().toLowerCase());

                let hasDifferentLocation = false;
                let locationLines = [];

                const locAddrForCompare = [locStreetVal, [locZipVal, locCityVal].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                if (locAddrForCompare.trim() !== '') {
                    const opAddrForCompare = [opStreet, [opZip, opCity].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                    const cleanCust = opAddrForCompare.replace(/\s+/g, ' ').trim().toLowerCase();
                    const cleanLoc = locAddrForCompare.replace(/\s+/g, ' ').trim().toLowerCase();

                    const companyDiffers = locCompanyVal !== '' && locCompanyVal.toLowerCase() !== customerName.toLowerCase();
                    const addressDiffers = cleanCust !== cleanLoc;

                    if (addressDiffers || companyDiffers) {
                        hasDifferentLocation = true;
                        if (companyDiffers) locationLines.push(locCompanyVal);
                        if (locStreetVal) locationLines.push(locStreetVal);
                        if (locZipVal || locCityVal) locationLines.push([locZipVal, locCityVal].filter(Boolean).join(' '));
                        if (!isDefaultCountry(locCountryVal)) locationLines.push(locCountryVal);
                    }
                }

                // Ansprechpartner
                const contactPersonsArr = typeof window.collectServiceContactPersons === 'function' ? window.collectServiceContactPersons() : [];

                // Hotel / Unterkunft
                const hotelCompanyVal = document.getElementById('service-hotel-company')?.value.trim() || '';
                const hotelStreetVal = document.getElementById('service-hotel-street')?.value.trim() || '';
                const hotelZipVal = document.getElementById('service-hotel-zip')?.value.trim() || '';
                const hotelCityVal = document.getElementById('service-hotel-city')?.value.trim() || '';
                const hotelCountryVal = document.getElementById('service-hotel-country')?.value.trim() || '';

                let hotelLines = [];
                if (hotelCompanyVal) hotelLines.push(hotelCompanyVal);
                if (hotelStreetVal) hotelLines.push(hotelStreetVal);
                if (hotelZipVal || hotelCityVal) {
                    hotelLines.push([hotelZipVal, hotelCityVal].filter(Boolean).join(' '));
                }
                if (hotelCountryVal) hotelLines.push(hotelCountryVal);
                const hasHotel = hotelLines.length > 0;

                const serviceYearDigitVal = document.getElementById('service-workshop-year-digit')?.value.trim() || '';
                const serviceSuffixVal = document.getElementById('service-workshop-order-suffix')?.value.trim() || '';
                const workshopOrderNumberVal = serviceSuffixVal ? `202${serviceYearDigitVal}-40${serviceSuffixVal.padStart(3, '0')}` : '';
                let titleText = 'Servicebericht';
                if (workshopOrderNumberVal) {
                    titleText += `: ${workshopOrderNumberVal}`;
                }
                
                // Title
                doc.setFont('helvetica', 'bold');
                const titleFontSize = titleText.length > 25 ? 18 : 22;
                doc.setFontSize(titleFontSize);
                doc.setTextColor(30, 41, 59); // slate color
                doc.text(titleText, 20, 36);
                
                // Header date
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(0, 0, 0);
                const dateW = doc.getTextWidth('Datum: ');
                doc.text('Datum: ', 160, 36);
                doc.setFont('helvetica', 'normal');
                const formattedDateStart = dateStart ? new Date(dateStart).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'}) : new Date().toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'});
                const formattedDateEnd = dateEnd ? new Date(dateEnd).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '';
                doc.text(formattedDateStart, 160 + dateW, 36);

                if (formattedDateEnd && formattedDateEnd !== formattedDateStart) {
                    doc.setFont('helvetica', 'bold');
                    doc.text('Bis: ', 160, 43);
                    doc.setFont('helvetica', 'normal');
                    doc.text(formattedDateEnd, 160 + dateW, 43);
                }
                
                // Content area start
                // Fester oberer/unterer Rand für alle Seiten, damit der Druck nicht in Kopf- oder Fußbereich (Logo) der Hintergrundvorlage hineinläuft
                const PAGE_CONTENT_TOP = 30;
                const PAGE_CONTENT_BOTTOM = 270;
                let currentY = 52;
                
                // Draw Betreiber/Rechnungsadresse
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text('Betreiber / Rechnungsadresse:', 20, currentY);
                doc.setFont('helvetica', 'normal');
                
                let leftY = currentY + 6;
                operatorLines.forEach(line => {
                    doc.text(line, 20, leftY);
                    leftY += 5;
                });

                if (contactPersonsArr.length > 0) {
                    leftY += 2;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Ansprechpartner:', 20, leftY);
                    leftY += 5;
                    doc.setFont('helvetica', 'normal');
                    contactPersonsArr.forEach(cp => {
                        const namePart = cp.name || '';
                        const phonePart = cp.phone || '';
                        const line = [namePart, phonePart].filter(Boolean).join(' | ');
                        if (line) { doc.text(line, 20, leftY); leftY += 5; }
                    });
                }

                // Wenn ein abweichender Maschinenstandort vorhanden ist, wandert das Hotel
                // auf die rechte Seite, mit Überschrift auf gleicher Höhe wie "Maschinenstandort:"
                const hotelOnRight = hasDifferentLocation && hasHotel;
                let maschinenstandortY = null;

                if (hasDifferentLocation) {
                    leftY += 2;
                    maschinenstandortY = leftY;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Maschinenstandort:', 20, leftY);
                    doc.setFont('helvetica', 'normal');
                    leftY += 6;
                    locationLines.forEach(line => {
                        doc.text(line, 20, leftY);
                        leftY += 5;
                    });
                }

                if (hasHotel && !hotelOnRight) {
                    leftY += 2;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Hotel / Unterkunft:', 20, leftY);
                    doc.setFont('helvetica', 'normal');
                    leftY += 6;
                    hotelLines.forEach(line => {
                        doc.text(line, 20, leftY);
                        leftY += 5;
                    });
                }

                // Draw Machine Details on the right
                let rightY = currentY;
                doc.setFont('helvetica', 'bold');
                doc.text('Maschine: ', 120, rightY);
                const maschineW = doc.getTextWidth('Maschine: ');
                doc.setFont('helvetica', 'normal');
                doc.text(String(machineTitle), 120 + maschineW, rightY);
                
                rightY += 6;
                doc.setFont('helvetica', 'bold');
                doc.text('Seriennummer: ', 120, rightY);
                const snW = doc.getTextWidth('Seriennummer: ');
                doc.setFont('helvetica', 'normal');
                doc.text(String(serialNumber), 120 + snW, rightY);
                
                rightY += 6;
                doc.setFont('helvetica', 'bold');
                doc.text('Baujahr: ', 120, rightY);
                const bjW = doc.getTextWidth('Baujahr: ');
                doc.setFont('helvetica', 'normal');
                doc.text(String(machineYear), 120 + bjW, rightY);
                
                rightY += 6;
                doc.setFont('helvetica', 'bold');
                doc.text('Betriebsstunden: ', 120, rightY);
                const bhW = doc.getTextWidth('Betriebsstunden: ');
                doc.setFont('helvetica', 'normal');
                let operatingHoursVal = document.getElementById('service-operating-hours')?.value.trim() || '';
                if (operatingHoursVal) {
                    operatingHoursVal = `${operatingHoursVal} (h)`;
                } else {
                    operatingHoursVal = '________________';
                }
                doc.text(String(operatingHoursVal), 120 + bhW, rightY);

                if (machine && (machine.motor_type || machine.motor_serial || machine.power)) {
                    rightY += 6;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Motor: ', 120, rightY);
                    const motorW = doc.getTextWidth('Motor: ');
                    doc.setFont('helvetica', 'normal');
                    doc.text(String(machine.motor_type || '-'), 120 + motorW, rightY);

                    const motorDetailParts = [machine.motor_serial ? `#${machine.motor_serial}` : null, machine.power].filter(Boolean);
                    if (motorDetailParts.length > 0) {
                        rightY += 6;
                        doc.text(motorDetailParts.join(' - '), 120, rightY);
                    }
                }

                let rightBottomY = rightY + 5;

                if (hotelOnRight) {
                    let hotelY = maschinenstandortY;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Hotel / Unterkunft:', 120, hotelY);
                    doc.setFont('helvetica', 'normal');
                    hotelY += 6;
                    hotelLines.forEach(line => {
                        doc.text(line, 120, hotelY);
                        hotelY += 5;
                    });
                    rightBottomY = Math.max(rightBottomY, hotelY);
                }

                currentY = Math.max(leftY, rightBottomY) + 6;
                
                // Section 3: Beschreibung (nur wenn vorhanden)
                if (description && description.trim() !== '') {
                    if (currentY > PAGE_CONTENT_BOTTOM) {
                        doc.addPage();
                        currentY = PAGE_CONTENT_TOP;
                    }
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.setTextColor(30, 41, 59);
                    doc.text('Fehlerbeschreibung / Kurzbeschreibung Einsatz', 20, currentY);
                    currentY += 8;
                    
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    doc.setTextColor(0, 0, 0);
                    const descLines = doc.splitTextToSize(description, 170);
                    doc.text(descLines, 20, currentY);
                    currentY += (descLines.length * 5) + 15;
                }
                
                // Work Log Table
                const workLogData = typeof window.getWorkLogTableData === 'function' ? window.getWorkLogTableData() : [];
                if (workLogData && workLogData.length > 0) {
                    if (currentY > PAGE_CONTENT_BOTTOM) {
                        doc.addPage();
                        currentY = PAGE_CONTENT_TOP;
                    }
                    // Header removed
                    
                    const headers = [['Datum', 'Typ', 'Pause', 'Fahr.- / Arbeitszeit', 'Kilometer']];

                    // Pro Tag die Gesamt-Nettozeit ermitteln, um die gesetzliche Pause zu bestimmen
                    const dateGroups = {};
                    workLogData.forEach(row => {
                        const key = row.datum || '';
                        if (!dateGroups[key]) dateGroups[key] = { count: 0, dayTotal: 0, pauseTotal: 0 };
                        const { net, pause } = window.computeWorkLogDuration(row);
                        dateGroups[key].count += 1;
                        dateGroups[key].dayTotal += net;
                        dateGroups[key].pauseTotal += pause;
                    });
                    // Gedruckte Pause darf nie unter der gesetzlich vorgeschriebenen Mindestpause liegen,
                    // aber wenn der Mitarbeiter mehr Pause eingetragen hat als gesetzlich nötig, gilt der
                    // höhere eingetragene Wert (nur nach oben korrigieren, nie nach unten).
                    const getLegalPauseText = (dayTotal, actualPauseHours) => {
                        // Für diesen Tag wurde noch keine Zeit eingetragen — Kasten leer lassen,
                        // damit ein Techniker die Pause später per Hand eintragen kann.
                        if (dayTotal <= 0) return '';
                        let requiredPauseHours = 0;
                        if (dayTotal > 9) requiredPauseHours = 0.75;
                        else if (dayTotal > 6) requiredPauseHours = 0.5;
                        const pauseHours = Math.max(actualPauseHours, requiredPauseHours);
                        if (pauseHours <= 0) return '/';
                        return `${Math.round(pauseHours * 60)} min`;
                    };

                    let lastDatum = null;
                    const body = workLogData.map(row => {
                        let formattedDate = row.datum;
                        if (row.datum) {
                            try {
                                const parts = row.datum.split('-');
                                if (parts.length === 3) formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
                            } catch(e){}
                        }

                        let typText = row.typ || 'Arbeitszeit';

                        let zeitRaw = (row.zeit || row.arbeitszeit || row.fahrzeit || '').trim();
                        let zeitText = '';
                        if (zeitRaw) {
                            zeitText = zeitRaw.toLowerCase().includes('uhr') ? zeitRaw : `${zeitRaw} Uhr`;
                        } else {
                            // Keine Zeit eingetragen — "von:"/"bis:" als Platzhalter drucken,
                            // damit der Techniker die Zeiten per Hand eintragen kann. Leerzeilen
                            // dazwischen strecken die Zelle und verteilen "von:"/"bis:" gleichmäßig
                            // über die Zellenhöhe, damit genug Platz für größere Handschrift bleibt.
                            zeitText = { content: 'von:\n\n\nbis:', styles: { halign: 'left' } };
                        }

                        let kmVal = '/';
                        if (row.typ !== 'Arbeitszeit') {
                            let kmRaw = (row.kilometer || '').trim();
                            if (kmRaw && kmRaw !== '/') {
                                kmVal = kmRaw.toLowerCase().includes('km') ? kmRaw : `${kmRaw} km`;
                            } else {
                                kmVal = kmRaw || '';
                            }
                        }

                        const datum = row.datum || '';
                        const rowArr = [formattedDate || '', typText];
                        if (datum !== lastDatum) {
                            const group = dateGroups[datum];
                            rowArr.push({ content: getLegalPauseText(group.dayTotal, group.pauseTotal), rowSpan: group.count, styles: { halign: 'center', valign: 'middle' } });
                        }
                        lastDatum = datum;
                        rowArr.push(zeitText, kmVal);
                        return rowArr;
                    });
                    
                    doc.autoTable({
                        startY: currentY,
                        head: headers,
                        body: body,
                        // Zeile nie über eine Seitengrenze hinweg aufteilen — passt sie nicht mehr
                        // komplett auf die Seite, wandert die ganze Zeile auf die nächste.
                        rowPageBreak: 'avoid',
                        margin: { top: PAGE_CONTENT_TOP, bottom: 297 - PAGE_CONTENT_BOTTOM, left: 20, right: 20 },
                        theme: 'grid',
                        styles: {
                            font: 'helvetica',
                            fontSize: 9,
                            cellPadding: 4,
                            halign: 'center',
                            valign: 'middle'
                        },
                        headStyles: {
                            // Eigener, weiterhin dunkler Blauton (dunkles Petrol-Blau) — anders als
                            // Wartung/UVV/Einweisung, aber genauso dunkel, kein "helles" Blau.
                            fillColor: [8, 47, 73],
                            textColor: [255, 255, 255],
                            fontStyle: 'bold',
                            halign: 'center',
                            valign: 'middle'
                        },
                        alternateRowStyles: {
                            fillColor: [248, 250, 252]
                        },
                        columnStyles: {
                            0: { cellWidth: 25 },
                            1: { cellWidth: 30 },
                            2: { cellWidth: 25 },
                            3: { cellWidth: 50, fontStyle: 'bold' },
                            4: { cellWidth: 40 }
                        }
                    });
                    
                    currentY = doc.lastAutoTable.finalY + 15;
                }
                
                // Arbeiten Table
                const tasksData = typeof window.getTasksTableData === 'function' ? window.getTasksTableData() : [];
                if (tasksData && tasksData.length > 0) {
                    if (currentY > PAGE_CONTENT_BOTTOM) {
                        doc.addPage();
                        currentY = PAGE_CONTENT_TOP;
                    }
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.setTextColor(8, 47, 73);
                    doc.text('Ausgeführte Arbeiten', 20, currentY);
                    currentY += 6;
                    
                    const taskHeaders = [['Aufgabe', 'Erledigt']];
                    const taskBody = tasksData.map(row => [
                        row.task,
                        ''
                    ]);
                    
                    doc.autoTable({
                        startY: currentY,
                        head: taskHeaders,
                        body: taskBody,
                        rowPageBreak: 'avoid',
                        margin: { top: PAGE_CONTENT_TOP, bottom: 297 - PAGE_CONTENT_BOTTOM, left: 20, right: 20 },
                        theme: 'grid',
                        styles: {
                            font: 'helvetica',
                            fontSize: 9,
                            cellPadding: 4
                        },
                        headStyles: {
                            fillColor: [8, 47, 73],
                            textColor: [255, 255, 255],
                            fontStyle: 'bold',
                            halign: 'center'
                        },
                        alternateRowStyles: {
                            fillColor: [248, 250, 252]
                        },
                        columnStyles: {
                            0: { cellWidth: 144, halign: 'left' },
                            1: { cellWidth: 26, halign: 'center' }
                        },
                        didDrawCell: function(data) {
                            if (data.column.index === 1 && data.cell.section === 'body') {
                                const xc = data.cell.x + data.cell.width / 2;
                                const yc = data.cell.y + data.cell.height / 2;
                                const size = 4.5;
                                const x = xc - size / 2;
                                const y = yc - size / 2;

                                // Draw checkmark if task is completed
                                const isCompleted = tasksData[data.row.index]?.completed;
                                if (isCompleted) {
                                    doc.setDrawColor(8, 47, 73); // matching header / text color
                                    doc.setLineWidth(0.75);
                                    doc.setLineCap('round');
                                    doc.line(x + 0.8, y + 2.3, x + 2, y + 3.5);
                                    doc.line(x + 2, y + 3.5, x + 3.8, y + 1.2);
                                    doc.setLineCap('butt');
                                }
                            }
                        }
                    });
                    
                    currentY = doc.lastAutoTable.finalY + 15;
                }

                // Materialien Table
                const materialsData = typeof window.getMaterialsTableData === 'function' ? window.getMaterialsTableData() : [];
                if (materialsData && materialsData.length > 0) {
                    if (currentY > PAGE_CONTENT_BOTTOM) {
                        doc.addPage();
                        currentY = PAGE_CONTENT_TOP;
                    }
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.setTextColor(8, 47, 73);
                    doc.text('Eingesetztes Material', 20, currentY);
                    currentY += 6;
                    
                    const matHeaders = [['Art.-Nr.', 'Beschreibung', 'Menge']];
                    const matBody = materialsData.map(row => [
                        row.article_number || '',
                        row.description || '',
                        row.quantity || ''
                    ]);
                    
                    doc.autoTable({
                        startY: currentY,
                        head: matHeaders,
                        body: matBody,
                        rowPageBreak: 'avoid',
                        margin: { top: PAGE_CONTENT_TOP, bottom: 297 - PAGE_CONTENT_BOTTOM, left: 20, right: 20 },
                        theme: 'grid',
                        styles: {
                            font: 'helvetica',
                            fontSize: 9,
                            cellPadding: 4
                        },
                        headStyles: {
                            fillColor: [8, 47, 73],
                            textColor: [255, 255, 255],
                            fontStyle: 'bold',
                            halign: 'center'
                        },
                        alternateRowStyles: {
                            fillColor: [248, 250, 252]
                        },
                        columnStyles: {
                            0: { cellWidth: 28 },
                            1: { cellWidth: 122 },
                            2: { cellWidth: 20, halign: 'center' }
                        }
                    });
                    
                    currentY = doc.lastAutoTable.finalY + 15;
                }

                // Bemerkungen: ist das Feld ausgefüllt, wird nur der Text gedruckt.
                // Ist es leer, werden stattdessen 5 leere Linien gedruckt, damit ein
                // leer ausgedruckter Bericht per Hand beschriftet werden kann.
                const remarksHasText = remarks && remarks.trim() !== '';
                const remarksLineCount = 5;
                const remarksLineHeight = 7;
                let remarksTextLines = [];
                if (remarksHasText) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    remarksTextLines = doc.splitTextToSize(remarks, 170);
                }
                const remarksTextHeight = remarksTextLines.length * 5;
                const remarksBlockHeight = 8 + (remarksHasText ? remarksTextHeight : remarksLineCount * remarksLineHeight);

                if (currentY + remarksBlockHeight > PAGE_CONTENT_BOTTOM) {
                    doc.addPage();
                    currentY = PAGE_CONTENT_TOP;
                }

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(8, 47, 73);
                doc.text('Bemerkungen', 20, currentY);
                currentY += 8;

                if (remarksHasText) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    doc.setTextColor(0, 0, 0);
                    doc.text(remarksTextLines, 20, currentY);
                    currentY += remarksTextHeight;
                } else {
                    doc.setDrawColor(150, 150, 150);
                    doc.setLineWidth(0.3);
                    for (let i = 0; i < remarksLineCount; i++) {
                        doc.line(20, currentY, 190, currentY);
                        currentY += remarksLineHeight;
                    }
                }
                currentY += 3;

                // Checkboxes
                const statusRepairedChecked = document.getElementById('service-status-repaired')?.checked || false;
                const statusRepairedEnChecked = document.getElementById('service-status-repaired-en')?.checked || false;
                
                if (currentY + 22 > PAGE_CONTENT_BOTTOM) {
                    doc.addPage();
                    currentY = PAGE_CONTENT_TOP;
                }

                // Draw checkboxes
                doc.setDrawColor(100, 116, 139);
                doc.setLineWidth(0.4);
                
                // Box 1
                doc.rect(20, currentY, 4, 4);
                if (statusRepairedChecked) {
                    // Draw checkmark
                    doc.setLineCap('round');
                    doc.line(20.5, currentY + 2, 21.5, currentY + 3.5);
                    doc.line(21.5, currentY + 3.5, 23.5, currentY + 0.5);
                    doc.setLineCap('butt');
                }
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(30, 41, 59);
                doc.text('O. g. gemeldete Störung ist behoben und die Reparatur in vollem Umfang ausgeführt.', 28, currentY + 3.2);
                
                currentY += 7;
                
                // Box 2
                doc.rect(20, currentY, 4, 4);
                if (statusRepairedEnChecked) {
                    // Draw checkmark
                    doc.setLineCap('round');
                    doc.line(20.5, currentY + 2, 21.5, currentY + 3.5);
                    doc.line(21.5, currentY + 3.5, 23.5, currentY + 0.5);
                    doc.setLineCap('butt');
                }
                doc.text('The a. a. malfunction has been repaired and repair has fully completed.', 28, currentY + 3.2);
                
                currentY += 15;
                
                // Check page height for signatures
                if (currentY + 31 > PAGE_CONTENT_BOTTOM) {
                    doc.addPage();
                    currentY = PAGE_CONTENT_TOP;
                }
                
                // Techniker & Unterschrift
                const techNames = (typeof selectedTechs !== 'undefined' ? selectedTechs : []).map(id => {
                    const u = (window.userList || []).find(user => user.id == id);
                    return u ? u.name : `Techniker #${id}`;
                }).join(', ') || '-';
                
                // Techniker-Name oben
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(30, 41, 59);
                doc.text(`Techniker: ${techNames}`, 20, currentY);
                currentY += 8;
                
                // Techniker-Unterschrift links
                if (techSignature && techSignature.startsWith('data:image')) {
                    try {
                        doc.addImage(techSignature, 'PNG', 20, currentY, 70, 22);
                    } catch(e) {}
                }
                // Kunden-Unterschrift rechts
                if (signature) {
                    try {
                        doc.addImage(signature, 'PNG', 110, currentY, 70, 22);
                    } catch(sigErr) {}
                }
                doc.setDrawColor(150, 150, 150);
                doc.setLineWidth(0.5);
                doc.line(20, currentY + 22, 90, currentY + 22);   // Links: Techniker
                doc.line(110, currentY + 22, 190, currentY + 22); // Rechts: Kunde
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                const _techSigDateRaw = document.getElementById('service-tech-sig-date')?.value || dateStart;
                const _custSigDateRaw = document.getElementById('service-customer-sig-date')?.value || dateStart;
                const _fmtSigDate = d => { if (!d) return ''; const p = d.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };
                doc.text(`Unterschrift Techniker, ${_fmtSigDate(_techSigDateRaw)}`, 20, currentY + 27);
                doc.text(`Unterschrift Kunde, ${_fmtSigDate(_custSigDateRaw)}`, 110, currentY + 27);
                if (signatureName) {
                    doc.text(signatureName, 110, currentY + 31);
                }
                
                // Append Checklist if any
                const checklistPayload = typeof window.getChecklistPayload === 'function' ? window.getChecklistPayload() : null;
                if (checklistPayload) {
                    let checklistsToPrint = [];
                    if (checklistPayload.checklists && Array.isArray(checklistPayload.checklists)) {
                        checklistsToPrint = checklistPayload.checklists;
                    } else if (checklistPayload.template_id && checklistPayload.answers) {
                        // Backward compatibility for single checklist
                        checklistsToPrint = [{
                            template_id: checklistPayload.template_id,
                            title: checklistPayload.title || "Zusatzprotokoll",
                            answers: checklistPayload.answers
                        }];
                    }
                    
                    checklistsToPrint.forEach(checklist => {
                        if (!checklist.answers || checklist.answers.length === 0) return;

                        const isUvv = checklist.type === 'uvv' || checklist.type === 'einweisung' || (checklist.template_id && checklist.template_id.includes('uvv'));

                        // Bei Wartungsprotokollen: wenn per "Drucken"-Haken alle Übergruppen
                        // abgewählt wurden, bleibt nichts zu drucken übrig — dann ganze Seite auslassen.
                        if (!isUvv) {
                            const hasPrintableAnswer = checklist.answers.some(ans =>
                                !checklist.categoryIncluded || checklist.categoryIncluded[ans.category] !== false
                            );
                            if (!hasPrintableAnswer) return;
                        }

                        doc.addPage();
                        
                        // Clean title from emojis
                        const cleanTitle = (checklist.title || 'Zusatzprotokoll').replace(/[^\w\s\/\-äöüÄÖÜß()]/g, '').trim();

                        // Jeder Protokoll-Typ bekommt einen eigenen, aber durchgehend dunklen Blauton
                        // (auf der Tabellen-Kopfzeile UND der Seitenüberschrift), damit man sofort
                        // erkennt, um welchen Beleg es sich handelt, ohne dass es "hell" wirkt.
                        const checklistThemeColor = checklist.type === 'einweisung' ? [30, 58, 138]   // dunkles Blau
                            : checklist.type === 'uvv' ? [23, 37, 84]                                  // sehr dunkles Indigo-Blau
                            : [15, 23, 42];                                                            // Wartung: fast schwarzes Blau

                        // Draw Checklist Title
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(16);
                        doc.setTextColor(checklistThemeColor[0], checklistThemeColor[1], checklistThemeColor[2]);
                        doc.text(cleanTitle, 20, 30);
                        
                        // Meta Info
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(10);
                        doc.setTextColor(100, 100, 100);
                        doc.text(`Maschine: ${machineTitle} | Seriennummer: ${serialNumber} | Betriebsstunden: ${operatingHoursVal}${machine && (machine.motor_type || machine.motor_serial || machine.power) ? ` | Motor: ${[machine.motor_type, machine.motor_serial ? `#${machine.motor_serial}` : null, machine.power].filter(Boolean).join(' - ')}` : ''}`, 20, 37);

                        // Ausfüllhinweise nur bei der Einweisungserklärung, nur auf dem Ausdruck (nicht
                        // im Formular) und nur auf dieser ersten Seite (steht NICHT im didDrawPage-Callback,
                        // das die Kopfzeile bei mehrseitigen Protokollen auf Folgeseiten wiederholt).
                        // Jede Zeile zeigt einen echten kleinen Kasten mit dem jeweiligen Symbol, statt
                        // es nur in Worten zu beschreiben — so sieht es genauso aus wie in der Tabelle.
                        if (checklist.type === 'einweisung') {
                            const legendX = 145;
                            let legendY = 22;

                            const boxSize = 5.5;
                            const drawLegendRow = (symbol, symbolColor, label) => {
                                doc.setDrawColor(150, 150, 150);
                                doc.setLineWidth(0.25);
                                doc.rect(legendX, legendY, boxSize, boxSize);
                                if (symbol) {
                                    doc.setFont('helvetica', 'bold');
                                    doc.setFontSize(11);
                                    doc.setTextColor(symbolColor[0], symbolColor[1], symbolColor[2]);
                                    doc.text(symbol, legendX + boxSize / 2, legendY + boxSize - 1.4, { align: 'center' });
                                }
                                doc.setFont('helvetica', 'normal');
                                doc.setFontSize(7.5);
                                doc.setTextColor(80, 80, 80);
                                doc.text(label, legendX + boxSize + 2, legendY + boxSize - 1.6);
                                legendY += boxSize + 2;
                            };

                            drawLegendRow('x', [5, 150, 105], '= O.k.');
                            drawLegendRow('-', [217, 119, 6], '= nicht gegeben');
                            drawLegendRow('', [0, 0, 0], '= noch offen');
                        }

                        let currentCatCL = "";
                        const checklistBody = [];
                        const categoryRowsCL = [];
                        const isEinweisungPdf = checklist.type === 'einweisung';

                        if (isUvv) {
                            if (isEinweisungPdf) {
                                // Einweisung-Layout: Pos | Einweisungspunkt | Erledigt / Bemerkung (zusammengelegt —
                                // pro Punkt entweder x/-/frei ODER der Bemerkungstext, je nach answerType, genau
                                // wie im Formular; keine eigene Bemerkungsspalte mehr nötig).
                                const categoryStatusByRow = {};
                                // Merkt sich pro Zeile, ob es ein Bemerkungsfeld (Freitext, kein Kasten)
                                // statt eines Ankreuzfelds ist — gebraucht in didDrawCell unten.
                                const isRemarkRowByIdx = {};
                                // Pos. wird im Ausdruck nicht mehr angezeigt (siehe Tabellenkopf unten) und
                                // hat daher auch keinen Einfluss mehr darauf, ob ein Punkt gedruckt wird —
                                // alle Punkte erscheinen unabhängig von Pos.
                                checklist.answers.forEach((ans) => {
                                    if (ans.category !== currentCatCL) {
                                        currentCatCL = ans.category;
                                        checklistBody.push([currentCatCL.toUpperCase(), '']);
                                        const rowIdx = checklistBody.length - 1;
                                        categoryRowsCL.push(rowIdx);
                                        categoryStatusByRow[rowIdx] = (checklist.categoryStatus && checklist.categoryStatus[currentCatCL]) || '';
                                    }
                                    const isRemarkAns = ans.answerType === 'remark';
                                    const cellText = isRemarkAns
                                        ? ((ans.comment && ans.comment.trim()) ? ans.comment : '')
                                        : (ans.io === 'x' ? 'x' : (ans.io === 'dash' ? '-' : ''));
                                    checklistBody.push([ans.description || '', cellText]);
                                    isRemarkRowByIdx[checklistBody.length - 1] = isRemarkAns;
                                });

                                doc.autoTable({
                                    startY: 44,
                                    // Pos. wird im Ausdruck der Einweisungserklärung nicht mehr gebraucht
                                    // (bleibt aber als Datenfeld im Plan-Editor/Servicebericht bestehen,
                                    // u.a. damit Punkte ohne Pos. weiterhin vom Druck ausgeschlossen werden).
                                    head: [['Einweisungspunkt', 'Erledigt / Bemerkung']],
                                    // Wichtig: eine Zeile (insb. die Kategorie-Zeile mit dem davorgezeichneten
                                    // Ankreuzfeld) darf nie über eine Seitengrenze hinweg aufgeteilt werden —
                                    // sonst landet z.B. nur der Kasten am Seitenende und der Text auf der
                                    // nächsten Seite. Passt die Zeile nicht mehr, wandert sie komplett um.
                                    rowPageBreak: 'avoid',
                                    body: checklistBody,
                                    margin: { top: 44, bottom: 297 - PAGE_CONTENT_BOTTOM, left: 20, right: 20 },
                                    theme: 'grid',
                                    styles: {
                                        font: 'helvetica',
                                        fontSize: 7.5,
                                        cellPadding: 2,
                                        valign: 'middle'
                                    },
                                    headStyles: {
                                        fillColor: checklistThemeColor,
                                        textColor: [255, 255, 255],
                                        fontStyle: 'bold',
                                        halign: 'center'
                                    },
                                    columnStyles: {
                                        0: { cellWidth: 125 },
                                        1: { cellWidth: 45, halign: 'center' }
                                    },
                                    didParseCell: function(data) {
                                        if (data.cell.section === 'head' && data.column.index === 1) {
                                            data.cell.styles.halign = 'center';
                                        }
                                        const isCategoryRow = categoryRowsCL.includes(data.row.index);
                                        if (isCategoryRow && data.cell.section === 'body') {
                                            data.cell.styles.fillColor = [241, 245, 249];
                                            data.cell.styles.fontStyle = 'bold';
                                            if (data.column.index === 0) {
                                                data.cell.styles.textColor = [15, 23, 42];
                                                // Wieder über die komplette Zeilenbreite — das Ankreuzfeld
                                                // der Kategorie wird stattdessen vor den Text gezeichnet
                                                // (siehe didDrawCell), nicht mehr in einer eigenen Spalte.
                                                data.cell.colSpan = 2;
                                                data.cell.styles.cellPadding = { top: 2, right: 2, bottom: 2, left: 9 };
                                            }
                                            return;
                                        }
                                        // Spalte 2 bei Punkten mit Ankreuzfeld (kein Bemerkungstext): Text wird
                                        // unterdrückt, weil didDrawCell stattdessen einen kleinen Kasten mit dem
                                        // Symbol zeichnet (gleicher Look wie das Kategorie-Ankreuzfeld). Bei
                                        // Bemerkungsfeldern bleibt es normaler, linksbündiger Fließtext.
                                        if (data.column.index === 1 && data.cell.section === 'body') {
                                            if (!isRemarkRowByIdx[data.row.index]) {
                                                data.cell.text = [];
                                                data.cell.styles.halign = 'center';
                                            } else {
                                                data.cell.styles.halign = 'left';
                                            }
                                        }
                                    },
                                    didDrawCell: function(data) {
                                        // Ankreuzfeld der Kategorie: kleiner Kasten direkt vor dem
                                        // Kategorienamen, innerhalb derselben volle Zeilenbreite.
                                        if (data.column.index === 0 && data.cell.section === 'body' && categoryRowsCL.includes(data.row.index)) {
                                            const status = categoryStatusByRow[data.row.index] || '';
                                            const boxSize = 4.5;
                                            const bx = data.cell.x + 2;
                                            const by = data.cell.y + (data.cell.height - boxSize) / 2;
                                            doc.setDrawColor(140, 140, 140);
                                            doc.setLineWidth(0.3);
                                            doc.rect(bx, by, boxSize, boxSize);
                                            if (status === 'x' || status === 'dash') {
                                                doc.setFont('helvetica', 'bold');
                                                doc.setFontSize(9);
                                                doc.setTextColor(...(status === 'x' ? [5, 150, 105] : [217, 119, 6]));
                                                doc.text(status === 'x' ? 'x' : '-', bx + boxSize / 2, by + boxSize - 1.2, { align: 'center' });
                                            }
                                        }
                                        // Ankreuzfeld des einzelnen Punkts: gleicher kleiner Kasten, mittig in
                                        // der Erledigt/Bemerkung-Spalte (nicht bei Bemerkungsfeldern).
                                        if (data.column.index === 1 && data.cell.section === 'body' && !categoryRowsCL.includes(data.row.index) && !isRemarkRowByIdx[data.row.index]) {
                                            const raw = (data.row.raw && data.row.raw[1]) || '';
                                            const boxSize = 5;
                                            const bx = data.cell.x + (data.cell.width - boxSize) / 2;
                                            const by = data.cell.y + (data.cell.height - boxSize) / 2;
                                            doc.setDrawColor(140, 140, 140);
                                            doc.setLineWidth(0.3);
                                            doc.rect(bx, by, boxSize, boxSize);
                                            if (raw === 'x' || raw === '-') {
                                                doc.setFont('helvetica', 'bold');
                                                doc.setFontSize(9);
                                                doc.setTextColor(...(raw === 'x' ? [5, 150, 105] : [217, 119, 6]));
                                                doc.text(raw, bx + boxSize / 2, by + boxSize - 1.3, { align: 'center' });
                                            }
                                        }
                                    },
                                    didDrawPage: function(data) {
                                        if (data.pageNumber > 1) {
                                            doc.setFont('helvetica', 'bold');
                                            doc.setFontSize(16);
                                            doc.setTextColor(checklistThemeColor[0], checklistThemeColor[1], checklistThemeColor[2]);
                                            doc.text(cleanTitle, 20, 30);
                                            doc.setFont('helvetica', 'normal');
                                            doc.setFontSize(10);
                                            doc.setTextColor(100, 100, 100);
                                            doc.text(`Maschine: ${machineTitle} | Seriennummer: ${serialNumber} | Betriebsstunden: ${operatingHoursVal}${machine && (machine.motor_type || machine.motor_serial || machine.power) ? ` | Motor: ${[machine.motor_type, machine.motor_serial ? `#${machine.motor_serial}` : null, machine.power].filter(Boolean).join(' - ')}` : ''}`, 20, 37);
                                        }
                                    }
                                });
                            } else {
                            // UVV Layout: Pos | Prüfpunkt | i.O. | Bemerkung / Beanstandung (no Intervall)
                            checklist.answers.forEach((ans) => {
                                if (ans.category !== currentCatCL) {
                                    currentCatCL = ans.category;
                                    checklistBody.push([currentCatCL.toUpperCase(), '', '', '']);
                                    categoryRowsCL.push(checklistBody.length - 1);
                                }
                                const ioText = ans.io === 'ja' ? 'Ja' : (ans.io === 'nein' ? 'Nein' : '');
                                checklistBody.push([
                                    ans.pos || '',
                                    ans.description || '',
                                    ioText,
                                    (ans.comment && ans.comment.trim()) ? ans.comment : 'keine Beanstandung'
                                ]);
                            });

                            doc.autoTable({
                                startY: 44,
                                head: [['Pos', 'Prüfpunkt', 'i.O.', 'Bemerkung / Beanstandung']],
                                body: checklistBody,
                                rowPageBreak: 'avoid',
                                margin: { top: 44, bottom: 297 - PAGE_CONTENT_BOTTOM, left: 20, right: 20 },
                                theme: 'grid',
                                styles: {
                                    font: 'helvetica',
                                    fontSize: 7.5,
                                    cellPadding: 2,
                                    valign: 'middle'
                                },
                                headStyles: {
                                    fillColor: checklistThemeColor,
                                    textColor: [255, 255, 255],
                                    fontStyle: 'bold',
                                    halign: 'center'
                                },
                                columnStyles: {
                                    0: { cellWidth: 15 },
                                    1: { cellWidth: 95 },
                                    2: { cellWidth: 18, halign: 'center' },
                                    3: { cellWidth: 42, halign: 'center' }
                                },
                                didParseCell: function(data) {
                                    // Force center on header cells for i.O. and Bemerkung columns
                                    if (data.cell.section === 'head' && (data.column.index === 2 || data.column.index === 3)) {
                                        data.cell.styles.halign = 'center';
                                    }
                                    if (categoryRowsCL.includes(data.row.index)) {
                                        if (data.cell.section === 'body') {
                                            data.cell.styles.fillColor = [241, 245, 249];
                                            data.cell.styles.fontStyle = 'bold';
                                            data.cell.styles.textColor = [15, 23, 42];
                                            if (data.column.index === 0) {
                                                data.cell.colSpan = 4;
                                            }
                                        }
                                    }
                                    // Color i.O. column: Ja = green, Nein = red
                                    if (data.column.index === 2 && data.cell.section === 'body' && !categoryRowsCL.includes(data.row.index)) {
                                        if (data.cell.raw === 'Ja') {
                                            data.cell.styles.textColor = [5, 150, 105];
                                            data.cell.styles.fontStyle = 'bold';
                                        } else if (data.cell.raw === 'Nein') {
                                            data.cell.styles.textColor = [220, 38, 38];
                                            data.cell.styles.fontStyle = 'bold';
                                        }
                                    }
                                },
                                didDrawPage: function(data) {
                                    if (data.pageNumber > 1) {
                                        doc.setFont('helvetica', 'bold');
                                        doc.setFontSize(16);
                                        doc.setTextColor(checklistThemeColor[0], checklistThemeColor[1], checklistThemeColor[2]);
                                        doc.text(cleanTitle, 20, 30);
                                        doc.setFont('helvetica', 'normal');
                                        doc.setFontSize(10);
                                        doc.setTextColor(100, 100, 100);
                                        doc.text(`Maschine: ${machineTitle} | Seriennummer: ${serialNumber} | Betriebsstunden: ${operatingHoursVal}${machine && (machine.motor_type || machine.motor_serial || machine.power) ? ` | Motor: ${[machine.motor_type, machine.motor_serial ? `#${machine.motor_serial}` : null, machine.power].filter(Boolean).join(' - ')}` : ''}`, 20, 37);
                                    }
                                }
                            });
                            }

                            // General remarks section for UVV
                            let uvvY = doc.lastAutoTable.finalY + 10;
                            // Make sure there's enough space; add page if needed
                            if (uvvY + 27 > PAGE_CONTENT_BOTTOM) { doc.addPage(); uvvY = PAGE_CONTENT_TOP; }
                            
                            doc.setFont('helvetica', 'bold');
                            doc.setFontSize(10);
                            doc.setTextColor(30, 41, 59);
                            doc.text('Bemerkungen:', 20, uvvY);
                            uvvY += 5;
                            doc.setDrawColor(180, 180, 180);
                            doc.setLineWidth(0.3);
                            doc.rect(20, uvvY, 170, 22);
                            if (checklist.generalRemark && checklist.generalRemark.trim()) {
                                doc.setFont('helvetica', 'normal');
                                doc.setFontSize(9);
                                doc.setTextColor(50, 50, 50);
                                const remarkLines = doc.splitTextToSize(checklist.generalRemark, 165);
                                doc.text(remarkLines, 23, uvvY + 5);
                            }
                            uvvY += 30;

                            const _uvvFmt = d => { if (!d) return ''; const p = d.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };

                            // Bei Einweisung zuerst die Unterschriften der eingewiesenen Personen
                            // (Fahrer/Mechaniker, beliebig viele, je 2 pro Zeile), erst danach
                            // Techniker/Kunde weiter unten.
                            if (isEinweisungPdf && Array.isArray(checklist.driverSignatures) && checklist.driverSignatures.length > 0) {
                                if (uvvY + 41 > PAGE_CONTENT_BOTTOM) { doc.addPage(); uvvY = PAGE_CONTENT_TOP; }
                                doc.setFont('helvetica', 'bold');
                                doc.setFontSize(10);
                                doc.setTextColor(checklistThemeColor[0], checklistThemeColor[1], checklistThemeColor[2]);
                                doc.text('Unterschriften eingewiesende Personen', 20, uvvY);
                                uvvY += 8;
                                for (let dsi = 0; dsi < checklist.driverSignatures.length; dsi += 2) {
                                    if (uvvY + 31 > PAGE_CONTENT_BOTTOM) { doc.addPage(); uvvY = PAGE_CONTENT_TOP; }
                                    [checklist.driverSignatures[dsi], checklist.driverSignatures[dsi + 1]].forEach((sig, pairIdx) => {
                                        if (!sig) return;
                                        const xPos = pairIdx === 0 ? 20 : 110;
                                        const lineEnd = pairIdx === 0 ? 95 : 190;
                                        if (sig.signature && sig.signature.startsWith('data:image')) {
                                            try { doc.addImage(sig.signature, 'PNG', xPos, uvvY - 2, 70, 22); } catch(e) {}
                                        }
                                        doc.setDrawColor(100, 100, 100);
                                        doc.setLineWidth(0.5);
                                        doc.line(xPos, uvvY + 22, lineEnd, uvvY + 22);
                                        doc.setFont('helvetica', 'normal');
                                        doc.setFontSize(8);
                                        doc.setTextColor(100, 100, 100);
                                        doc.text(`Unterschrift Fahrer/Mechaniker, ${_uvvFmt(sig.date)}`, xPos, uvvY + 27);
                                    });
                                    uvvY += 35;
                                }
                            }

                            // Signature section
                            if (uvvY + 31 > PAGE_CONTENT_BOTTOM) { doc.addPage(); uvvY = PAGE_CONTENT_TOP; }

                            // Technician name line
                            const uvvTechName = (typeof selectedTechs !== 'undefined' ? selectedTechs : []).map(id => {
                                const u = (window.userList || []).find(user => user.id == id);
                                return u ? u.name : '';
                            }).filter(Boolean).join(', ') || '';
                            doc.setFont('helvetica', 'bold');
                            doc.setFontSize(9);
                            doc.setTextColor(30, 41, 59);
                            doc.text(`Techniker: ${uvvTechName}`, 20, uvvY);
                            uvvY += 6;

                            // Tech signature image (left)
                            if (techSignature && techSignature.startsWith('data:image')) {
                                try {
                                    doc.addImage(techSignature, 'PNG', 20, uvvY - 2, 70, 22);
                                } catch(e) {}
                            }
                            // Customer signature image (right)
                            if (signature && signature.startsWith('data:image')) {
                                try {
                                    doc.addImage(signature, 'PNG', 110, uvvY - 2, 70, 22);
                                } catch(e) {}
                            }

                            // Signature lines
                            doc.setDrawColor(100, 100, 100);
                            doc.setLineWidth(0.5);
                            doc.line(20, uvvY + 22, 95, uvvY + 22);   // Left: Technician
                            doc.line(110, uvvY + 22, 190, uvvY + 22); // Right: Customer
                            doc.setFont('helvetica', 'normal');
                            doc.setFontSize(8);
                            doc.setTextColor(100, 100, 100);
                            const _uvvTechDate = document.getElementById('service-tech-sig-date')?.value || dateStart;
                            const _uvvCustDate = document.getElementById('service-customer-sig-date')?.value || dateStart;
                            doc.text(`Unterschrift Techniker, ${_uvvFmt(_uvvTechDate)}`, 20, uvvY + 27);
                            doc.text(`Unterschrift Kunde, ${_uvvFmt(_uvvCustDate)}`, 110, uvvY + 27);

                        } else {
                            // Wartung Layout: Pos | Wartungsarbeit | Intervall | Erledigt | Bemerkung
                            // Übergruppen, deren "Drucken"-Haken im Formular entfernt wurde
                            // (checklist.categoryIncluded[kategorie] === false), werden komplett
                            // ausgelassen — weder Kategorie-Kopfzeile noch ihre Punkte erscheinen.
                            const printableAnswers = checklist.answers.filter(ans =>
                                !checklist.categoryIncluded || checklist.categoryIncluded[ans.category] !== false
                            );
                            printableAnswers.forEach((ans) => {
                                if (ans.category !== currentCatCL) {
                                    currentCatCL = ans.category;
                                    checklistBody.push([currentCatCL.toUpperCase(), '', '', '', '']);
                                    categoryRowsCL.push(checklistBody.length - 1);
                                }
                                checklistBody.push([
                                    ans.pos || '',
                                    ans.description || '',
                                    ans.interval || '',
                                    ans.checked === 'na' ? 'na' : (ans.checked ? 'checked' : 'unchecked'),
                                    (ans.comment && ans.comment.trim()) ? ans.comment : '/'
                                ]);
                            });
                            
                            doc.autoTable({
                                startY: 44,
                                head: [['Pos', 'Wartungsarbeit / Prüfpunkt', 'Intervall / Frist', 'Erledigt', 'Bemerkung']],
                                body: checklistBody,
                                rowPageBreak: 'avoid',
                                margin: { top: 44, bottom: 297 - PAGE_CONTENT_BOTTOM, left: 20, right: 20 },
                                theme: 'grid',
                                styles: {
                                    font: 'helvetica',
                                    fontSize: 7.5,
                                    cellPadding: 2,
                                    valign: 'middle'
                                },
                                headStyles: {
                                    fillColor: checklistThemeColor,
                                    textColor: [255, 255, 255],
                                    fontStyle: 'bold',
                                    halign: 'center'
                                },
                                columnStyles: {
                                    0: { cellWidth: 15 },
                                    1: { cellWidth: 75 },
                                    2: { cellWidth: 33, halign: 'center' },
                                    3: { cellWidth: 22, halign: 'center' },
                                    4: { cellWidth: 25, halign: 'center' }
                                },
                                didParseCell: function(data) {
                                    // Force center on header cells for Intervall, Erledigt, Bemerkung
                                    if (data.cell.section === 'head' && (data.column.index === 2 || data.column.index === 3 || data.column.index === 4)) {
                                        data.cell.styles.halign = 'center';
                                    }
                                    if (categoryRowsCL.includes(data.row.index)) {
                                        if (data.cell.section === 'body') {
                                            data.cell.styles.fillColor = [241, 245, 249];
                                            data.cell.styles.fontStyle = 'bold';
                                            data.cell.styles.textColor = [15, 23, 42];
                                            if (data.column.index === 0) {
                                                data.cell.colSpan = 5;
                                            }
                                        }
                                    }
                                    if (data.column.index === 3 && data.cell.section === 'body') {
                                        data.cell.text = '';
                                    }
                                },
                                didDrawPage: function(data) {
                                    if (data.pageNumber > 1) {
                                        doc.setFont('helvetica', 'bold');
                                        doc.setFontSize(16);
                                        doc.setTextColor(checklistThemeColor[0], checklistThemeColor[1], checklistThemeColor[2]);
                                        doc.text(cleanTitle, 20, 30);
                                        doc.setFont('helvetica', 'normal');
                                        doc.setFontSize(10);
                                        doc.setTextColor(100, 100, 100);
                                        doc.text(`Maschine: ${machineTitle} | Seriennummer: ${serialNumber} | Betriebsstunden: ${operatingHoursVal}${machine && (machine.motor_type || machine.motor_serial || machine.power) ? ` | Motor: ${[machine.motor_type, machine.motor_serial ? `#${machine.motor_serial}` : null, machine.power].filter(Boolean).join(' - ')}` : ''}`, 20, 37);
                                    }
                                },
                                didDrawCell: function(data) {
                                    if (categoryRowsCL.includes(data.row.index)) return;
                                    const rowStatus = data.row.raw[3];
                                    if (data.column.index === 3 && data.cell.section === 'body') {
                                        const xc = data.cell.x + data.cell.width / 2;
                                        const yc = data.cell.y + data.cell.height / 2;
                                        const size = 4.5;
                                        const x = xc - size / 2;
                                        const y = yc - size / 2;
                                        doc.setDrawColor(100, 116, 139);
                                        doc.setLineWidth(0.4);
                                        doc.rect(x, y, size, size);
                                        if (rowStatus === 'checked') {
                                            doc.setDrawColor(checklistThemeColor[0], checklistThemeColor[1], checklistThemeColor[2]);
                                            doc.setLineWidth(0.75);
                                            doc.setLineCap('round');
                                            doc.line(x + 0.8, y + 2.3, x + 2, y + 3.5);
                                            doc.line(x + 2, y + 3.5, x + 3.8, y + 1.2);
                                            doc.setLineCap('butt');
                                        }
                                    }
                                    // "Nicht zutreffend": Querstrich über die gesamte Zeile
                                    if (rowStatus === 'na' && data.cell.section === 'body') {
                                        const yMid = data.cell.y + data.cell.height / 2;
                                        doc.setDrawColor(30, 58, 95);
                                        doc.setLineWidth(0.3);
                                        doc.line(data.cell.x, yMid, data.cell.x + data.cell.width, yMid);
                                    }
                                }
                            });
                        }
                    });
                }
                
                // Add global footer numbering "Seite X von Y" on all pages
                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(100, 100, 100);
                    const pageStr = `Seite ${i} von ${totalPages}`;
                    doc.text(pageStr, 190, 285, { align: 'right' });
                }
                
                return doc;
            } catch (err) {
                console.error(err);
                throw err;
            }
        };

        window.previewServiceberichtPDF = async function() {
            try {
                const doc = await window.generateServiceberichtPDFDoc();
                if (doc) {
                    const blobUrl = doc.output('bloburl');
                    const machineId = document.getElementById('selected-machine-id').value;
                    const machine = (window.machineList || []).find(m => m.id == machineId);
                    const machineTitle = machine ? `${machine.manufacturer || ''} ${machine.name || ''}`.trim() : 'Servicebericht';
                    
                    if (typeof window.previewDocument === 'function') {
                        window.previewDocument(blobUrl, `Vorschau Servicebericht - ${machineTitle}`, 'application/pdf');
                    } else {
                        window.open(blobUrl, '_blank');
                    }
                }
            } catch (err) {
                console.error(err);
                window.showToast('Fehler beim Generieren der PDF-Vorschau: ' + err.message);
            }
        };

        window.saveServiceberichtPDFToR2 = async function() {
            const confirmed = confirm('Soll dieser Bericht abgeschlossen werden?\n\nAnschließend ist keine Bearbeitung mehr möglich.');
            if (!confirmed) return;

            const btn = document.getElementById('btn-servicebericht-cloud-pdf');
            const statusEl = document.getElementById('servicebericht-pdf-status');

            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.7';
            }
            if (statusEl) statusEl.textContent = 'Speichert Bericht & generiert PDF...';
            
            try {
                // Auto-save report data to Supabase first so database and PDF are in perfect sync!
                const savedReportId = await window.saveServiceberichtData();
                const reportId = savedReportId || currentEditingServiceId;
                
                if (!reportId) {
                    throw new Error('Speichern des Serviceberichts fehlgeschlagen.');
                }

                if (statusEl) statusEl.textContent = 'PDF wird hochgeladen...';
                
                const doc = await window.generateServiceberichtPDFDoc();
                if (!doc) throw new Error('PDF-Generierung fehlgeschlagen.');
                
                const machineId = document.getElementById('selected-machine-id')?.value;
                if (!machineId) throw new Error('Keine Maschine ausgewählt.');
                
                const wsMachine = (window.machineList || []).find(m => m.id == machineId);
                if (!wsMachine) throw new Error('Maschinendetails konnten nicht ermittelt werden.');
                
                const wsFolderName = window.getMachineFolderName(wsMachine.id, wsMachine.manufacturer, wsMachine.name, wsMachine.serial || wsMachine.serial_number, wsMachine.year);

                // Use the existing "Servicebericht" folder from the Dokumente module
                const wsMachineIdInt = parseInt(machineId, 10);

                let { data: wsTargetFolder, error: wsFolderError } = await window.supabaseClient
                    .from('document_folders')
                    .select('id')
                    .eq('name', 'Servicebericht')
                    .maybeSingle();

                if (wsFolderError) throw wsFolderError;

                // Ordner existiert noch nicht (z.B. frische Installation oder versehentlich
                // gelöscht/umbenannt) — automatisch anlegen statt mit Fehler abzubrechen.
                if (!wsTargetFolder) {
                    const { data: createdFolder, error: createFolderError } = await window.supabaseClient
                        .from('document_folders')
                        .insert([{ name: 'Servicebericht', parent_id: null, machine_id: null }])
                        .select('id')
                        .single();
                    if (createFolderError) throw createFolderError;
                    wsTargetFolder = createdFolder;
                }

                const wsTargetFolderId = wsTargetFolder.id;

                const _sbCat = (window.categoryList || []).find(c => c.type === 'document' && c.name.toLowerCase() === 'servicebericht');
                const categoryValue = _sbCat?.name || 'Servicebericht';

                const serviceYearDigitVal = document.getElementById('service-workshop-year-digit')?.value.trim() || '';
                const serviceSuffixVal = document.getElementById('service-workshop-order-suffix')?.value.trim() || '';
                const orderNum = serviceSuffixVal ? `202${serviceYearDigitVal}-40${serviceSuffixVal.padStart(3, '0')}` : '';
                
                let datumVal = document.getElementById('service-date-start')?.value || new Date().toISOString().split('T')[0];
                let dateStr = datumVal;
                try {
                    const parts = datumVal.split('-');
                    if (parts.length === 3) dateStr = `${parts[2]}.${parts[1]}.${parts[0]}`;
                } catch(e){}
                
                let fileName = 'servicebericht';
                if (orderNum) {
                    fileName += `-${orderNum}`;
                }
                fileName += `-${dateStr}.pdf`;
                
                const filePath = `${wsFolderName}/serviceberichte/${fileName}`;
                
                const pdfBlob = doc.output('blob');
                const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
                
                console.log(`Uploading PDF ${fileName} to R2 path: ${filePath}`);
                const uploadResult = await window.FileUploadService.uploadFile(pdfFile, {
                    bucket: 'dateien',
                    path: filePath,
                    compress: false,
                    provider: 'cloudflare-r2'
                });
                
                const nowISO = new Date().toISOString();

                // Fotos des Berichts als Anhänge am Dokument mitführen — die
                // Kachel unter "Dokumente" zeigt dadurch die Anzahl an und
                // öffnet die Bilder direkt.
                const sbEntry = (window.allServiceEntries || []).find(e => String(e.id) === String(reportId));
                const sbAnhaenge = ((sbEntry && Array.isArray(sbEntry.files)) ? sbEntry.files : [])
                    .filter(f => f && f.url)
                    .map(f => ({ name: f.name || (f.url || '').split('/').pop(), url: f.url, path: f.path || null, type: f.type || '' }));

                // Erst das Dokument unter "Dokumente" anlegen/aktualisieren — der Bericht wird
                // erst danach als abgeschlossen markiert (siehe unten). Würde man zuerst
                // abschließen und das Dokument schlägt fehl, bliebe ein abgeschlossener, aber
                // nicht mehr bearbeitbarer Bericht ohne zugehöriges Dokument zurück.

                // Upsert in documents table - primär über service_entry_id verknüpfen,
                // damit ein erneutes Speichern immer den bestehenden Eintrag überschreibt
                // (auch wenn sich Dateiname/Pfad durch Datum/Auftragsnummer geändert hat).
                let { data: existingDoc } = await window.supabaseClient
                    .from('documents')
                    .select('id')
                    .eq('service_entry_id', reportId)
                    .maybeSingle();

                if (!existingDoc) {
                    const { data: legacyDoc } = await window.supabaseClient
                        .from('documents')
                        .select('id')
                        .eq('file_path', uploadResult.path)
                        .maybeSingle();
                    existingDoc = legacyDoc;
                }

                // Solange die Migration supabase_add_rental_agreements.sql noch
                // nicht gelaufen ist, gibt es die Spalte "attachments" nicht.
                // Dann wird der Schreibvorgang ohne dieses Feld wiederholt,
                // damit der Abschluss eines Berichts nicht daran scheitert.
                const ohneAnhangSpalte = (err) => /attachments/.test((err && err.message) || '');

                if (existingDoc) {
                    let { error: docUpdateError } = await window.supabaseClient
                        .from('documents')
                        .update({
                            name: fileName.replace('.pdf', ''),
                            category: categoryValue,
                            url: uploadResult.url,
                            file_path: uploadResult.path,
                            size: pdfFile.size,
                            created_at: nowISO,
                            folder_id: wsTargetFolderId,
                            service_entry_id: reportId,
                            attachments: sbAnhaenge
                        })
                        .eq('id', existingDoc.id);
                    if (docUpdateError && ohneAnhangSpalte(docUpdateError)) {
                        const wiederholung = await window.supabaseClient
                            .from('documents')
                            .update({
                                name: fileName.replace('.pdf', ''),
                                category: categoryValue,
                                url: uploadResult.url,
                                file_path: uploadResult.path,
                                size: pdfFile.size,
                                created_at: nowISO,
                                folder_id: wsTargetFolderId,
                                service_entry_id: reportId
                            })
                            .eq('id', existingDoc.id);
                        docUpdateError = wiederholung.error;
                    }
                    if (docUpdateError) {
                        console.error('Error updating document entry:', docUpdateError);
                        throw new Error('PDF wurde erzeugt, aber das Dokument unter "Dokumente" konnte nicht aktualisiert werden: ' + docUpdateError.message);
                    }
                } else {
                    let { error: docInsertError } = await window.supabaseClient
                        .from('documents')
                        .insert([{
                            name: fileName.replace('.pdf', ''),
                            category: categoryValue,
                            machine_id: wsMachineIdInt,
                            url: uploadResult.url,
                            file_path: uploadResult.path,
                            size: pdfFile.size,
                            mime_type: 'application/pdf',
                            folder_id: wsTargetFolderId,
                            service_entry_id: reportId,
                            attachments: sbAnhaenge
                        }]);
                    if (docInsertError && ohneAnhangSpalte(docInsertError)) {
                        const wiederholung = await window.supabaseClient
                            .from('documents')
                            .insert([{
                                name: fileName.replace('.pdf', ''),
                                category: categoryValue,
                                machine_id: wsMachineIdInt,
                                url: uploadResult.url,
                                file_path: uploadResult.path,
                                size: pdfFile.size,
                                mime_type: 'application/pdf',
                                folder_id: wsTargetFolderId,
                                service_entry_id: reportId
                            }]);
                        docInsertError = wiederholung.error;
                    }
                    if (docInsertError) {
                        console.error('Error inserting document entry:', docInsertError);
                        throw new Error('PDF wurde erzeugt, aber das Dokument unter "Dokumente" konnte nicht gespeichert werden: ' + docInsertError.message);
                    }
                }

                // Dokument ist sicher gespeichert — jetzt erst den Bericht als abgeschlossen markieren.
                const { error: updateError } = await window.supabaseClient
                    .from('service_entries')
                    .update({
                        pdf_url: uploadResult.url,
                        pdf_path: uploadResult.path,
                        pdf_created_at: nowISO,
                        is_finalized: true,
                        finalized_at: nowISO
                    })
                    .eq('id', reportId);

                if (updateError) throw updateError;

                // Update local allServiceEntries list so history lists get updated
                const entry = allServiceEntries.find(e => e.id === reportId);
                if (entry) {
                    entry.pdf_url = uploadResult.url;
                    entry.pdf_path = uploadResult.path;
                    entry.pdf_created_at = nowISO;
                    entry.is_finalized = true;
                    entry.finalized_at = nowISO;
                }
                
                // Re-render list
                if (typeof window.renderServiceEntries === 'function') {
                    window.renderServiceEntries();
                }
                
                // Update timestamp display on button
                if (statusEl) {
                    const d = new Date(nowISO);
                    const dStr = d.toLocaleDateString('de-DE');
                    const tStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                    statusEl.textContent = `Zuletzt gespeichert: ${dStr}, ${tStr} Uhr`;
                }
                
                window.showToast('Bericht abgeschlossen: PDF erfolgreich generiert, in der Cloud gespeichert und dem Bericht zugeordnet.');
                if (typeof window.closeServiceberichtModal === 'function') {
                    window.closeServiceberichtModal(true);
                }
            } catch (err) {
                console.error('Failed to save PDF to R2:', err);
                window.showToast('Fehler beim Speichern der PDF: ' + err.message);
                if (statusEl) statusEl.textContent = 'Speichern failed';
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            }
        };

        // Persistence on load
        if (localStorage.getItem('sidebarCollapsed') === 'true') {
            const s = document.getElementById('sidebar');
            const m = document.getElementById('main-wrapper');
            if (s) s.classList.add('collapsed');
            if (m) m.classList.add('collapsed-sidebar');
        }
