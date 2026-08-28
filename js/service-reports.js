/* ========================================================= */
/* ================= SERVICE REPORTS MODULE ================ */
/* ========================================================= */

window.calculateServiceRoute = async function() {
    const machineId = document.getElementById('selected-machine-id')?.value;
    if (!machineId) {
        window.showToast('Bitte wählen Sie zuerst eine Maschine aus, um die Route zu berechnen.');
        return;
    }
    
    const btn = document.querySelector('button[onclick="window.calculateServiceRoute()"]');
    const originalText = btn ? btn.textContent : 'Route & Fahrzeit automatisch schätzen';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Berechne Route...';
    }
    
    try {
        const machine = (window.machineList || []).find(m => m.id == machineId);
        if (!machine) throw new Error('Maschine nicht gefunden.');
        
        let destStreet = document.getElementById('service-location-street')?.value.trim();
        let destZip = document.getElementById('service-location-zip')?.value.trim();
        let destCity = document.getElementById('service-location-city')?.value.trim();
        let destCountry = document.getElementById('service-location-country')?.value.trim() || 'Deutschland';
        
        if (!destStreet || !destCity) {
            destStreet = machine.location_street || machine.operator_street || '';
            destZip = machine.location_zip || machine.operator_zip || '';
            destCity = machine.location_city || machine.operator_city || '';
            destCountry = machine.location_country || machine.operator_country || 'Deutschland';
        }
        
        if (!destStreet || !destCity) {
            window.showToast('Der Maschine/dem Kunden ist keine vollständige Adresse zugeordnet. Route kann nicht berechnet werden.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            return;
        }
        
        let hq = null;
        const cached = localStorage.getItem('meetra_company_hq');
        if (cached) {
            try { hq = JSON.parse(cached); } catch(e){}
        }
        if (!hq) {
            const { data: hqData } = await window.supabaseClient
                .from('app_settings')
                .select('value')
                .eq('key', 'company_hq')
                .single();
            if (hqData && hqData.value) {
                hq = hqData.value;
            }
        }
        
        if (!hq || !hq.street || !hq.city) {
            window.showToast('Bitte hinterlegen Sie zuerst die Firmenadresse (HQ) in den Einstellungen.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            return;
        }
        
        const originAddr = `${hq.street}, ${hq.zip} ${hq.city}, ${hq.country}`;
        const destAddr = `${destStreet}, ${destZip} ${destCity}, ${destCountry}`;
        
        const getCoords = async (addr) => {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&accept-language=de&q=${encodeURIComponent(addr)}&limit=1`);
            const data = await res.json();
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            }
            return null;
        };
        
        const originCoords = await getCoords(originAddr);
        const destCoords = await getCoords(destAddr);
        
        if (!originCoords || !destCoords) {
            throw new Error('Adresse konnte nicht geolokalisiert werden.');
        }
        
        const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`);
        const routeData = await routeRes.json();
        
        if (routeData && routeData.routes && routeData.routes.length > 0) {
            const route = routeData.routes[0];
            const distanceKm = (route.distance / 1000).toFixed(1);
            const durationMins = Math.round(route.duration / 60);
            
            document.getElementById('service-driving-distance').value = distanceKm;
            const durationHrs = (durationMins / 60).toFixed(1).replace('.', ',');
            document.getElementById('service-driving-time').value = `${durationMins}`;
            if (typeof window.updateDrivingTimeHoursPreview === 'function') window.updateDrivingTimeHoursPreview();
            
            const logRows = document.querySelectorAll('.service-work-log-row');
            logRows.forEach(tr => {
                const typInput = tr.querySelector('.log-typ');
                const kmInput = tr.querySelector('.log-kilometer');
                if (typInput && kmInput && (typInput.value === 'Anfahrt' || typInput.value === 'Abfahrt')) {
                    kmInput.value = distanceKm;
                }
            });
            
            window.showToast(`Route berechnet:\nEntfernung: ${distanceKm} km\nGeschätzte Fahrzeit: ${durationMins} Min. & ${durationHrs} Std.`);
        } else {
            throw new Error('Keine Route gefunden.');
        }
    } catch (err) {
        console.error(err);
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
        window.showRouteErrorModal();
    } finally {
        if (btn && !btn.disabled) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
};

window.updateDrivingTimeHoursPreview = function() {
    const val = document.getElementById('service-driving-time')?.value;
    const preview = document.getElementById('service-driving-time-hours-preview');
    if (preview) {
        const mins = parseInt(val);
        if (!isNaN(mins) && mins > 0) {
            const hrs = (mins / 60).toFixed(1).replace('.', ',');
            preview.textContent = `${hrs} Std.`;
        } else {
            preview.textContent = '- Std.';
        }
    }
};

window.syncDrivingDistanceToTable = function(distanceKm) {
    const logRows = document.querySelectorAll('.service-work-log-row');
    logRows.forEach(tr => {
        const typInput = tr.querySelector('.log-typ');
        const kmInput = tr.querySelector('.log-kilometer');
        if (typInput && kmInput && (typInput.value === 'Anfahrt' || typInput.value === 'Abfahrt')) {
            kmInput.value = distanceKm;
        }
    });
};

window.showRouteErrorModal = function() {
    const modal = document.getElementById('service-route-error-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('show'));
    }
};

window.closeRouteErrorModal = function() {
    const modal = document.getElementById('service-route-error-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
        setTimeout(() => modal.style.display = 'none', 300);
    }
};

window.openGoogleMapsRouteFallback = function() {
    window.closeRouteErrorModal();

    const machineId = document.getElementById('selected-machine-id')?.value;
    const machine = (window.machineList || []).find(m => m.id == machineId);
    
    let destStreet = document.getElementById('service-location-street')?.value.trim();
    let destZip = document.getElementById('service-location-zip')?.value.trim();
    let destCity = document.getElementById('service-location-city')?.value.trim();
    let destCountry = document.getElementById('service-location-country')?.value.trim() || 'Deutschland';
    
    if (machine && (!destStreet || !destCity)) {
        destStreet = machine.location_street || machine.operator_street || '';
        destZip = machine.location_zip || machine.operator_zip || '';
        destCity = machine.location_city || machine.operator_city || '';
        destCountry = machine.location_country || machine.operator_country || 'Deutschland';
    }

    let hq = null;
    const cached = localStorage.getItem('meetra_company_hq');
    if (cached) {
        try { hq = JSON.parse(cached); } catch(e){}
    }
    
    const origin = hq ? `${hq.street}, ${hq.zip} ${hq.city}, ${hq.country}` : '';
    const destination = `${destStreet}, ${destZip} ${destCity}, ${destCountry}`;

    if (origin || destination) {
        const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
        window.open(url, '_blank');
    } else {
        window.open('https://maps.google.com', '_blank');
    }

    const distInput = document.getElementById('fallback-driving-distance');
    if (distInput) distInput.value = '';
    const timeInput = document.getElementById('fallback-driving-time');
    if (timeInput) timeInput.value = '';

    const modal = document.getElementById('service-manual-route-input-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('show'));
    }
};

window.closeManualRouteInputModal = function() {
    const modal = document.getElementById('service-manual-route-input-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
        setTimeout(() => modal.style.display = 'none', 300);
    }
};

window.applyManualRouteInputs = function() {
    const distanceVal = document.getElementById('fallback-driving-distance')?.value.trim();
    const timeVal = document.getElementById('fallback-driving-time')?.value.trim();

    if (!distanceVal || !timeVal) {
        window.showToast('Bitte tragen Sie sowohl Kilometer als auch Fahrzeit ein.');
        return;
    }

    const distanceKm = parseFloat(distanceVal).toFixed(1);
    const durationMins = parseInt(timeVal);

    if (isNaN(distanceKm) || isNaN(durationMins)) {
        window.showToast('Bitte geben Sie gültige Werte ein.');
        return;
    }

    window.closeManualRouteInputModal();

    document.getElementById('service-driving-distance').value = distanceKm;
    document.getElementById('service-driving-time').value = `${durationMins}`;
    if (typeof window.updateDrivingTimeHoursPreview === 'function') window.updateDrivingTimeHoursPreview();

    const logRows = document.querySelectorAll('.service-work-log-row');
    logRows.forEach(tr => {
        const typInput = tr.querySelector('.log-typ');
        const kmInput = tr.querySelector('.log-kilometer');
        if (typInput && kmInput && (typInput.value === 'Anfahrt' || typInput.value === 'Abfahrt')) {
            kmInput.value = distanceKm;
        }
    });

    window.showToast(`Werte übernommen:\nEntfernung: ${distanceKm} km\nFahrzeit: ${durationMins} Min.`);
};

window.formatTimeInput = function(el) {
    let val = el.value.trim().replace(/[^\d:]/g, '');
    if (!val) return;
    if (val.includes(':')) {
        let parts = val.split(':');
        let h = parts[0].padStart(2, '0');
        let m = (parts[1] || '00').padEnd(2, '0').substring(0, 2);
        el.value = `${h}:${m}`;
        return;
    }
    if (val.length === 1 || val.length === 2) {
        el.value = val.padStart(2, '0') + ':00';
    } else if (val.length === 3) {
        el.value = '0' + val.charAt(0) + ':' + val.substring(1);
    } else if (val.length >= 4) {
        el.value = val.substring(0, 2) + ':' + val.substring(2, 4);
    }
};

window.computeWorkLogDuration = function(row) {
    const zeitRaw = (row.zeit || row.arbeitszeit || row.fahrzeit || '').trim();
    const timeParts = zeitRaw.split(' - ');
    let totalH = 0;
    if (timeParts.length === 2) {
        const parseTime = (t) => {
            const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
            return m ? parseInt(m[1]) + parseInt(m[2]) / 60 : null;
        };
        const vonH = parseTime(timeParts[0]);
        const bisH = parseTime(timeParts[1]);
        if (vonH !== null && bisH !== null) {
            totalH = bisH - vonH;
            if (totalH < 0) totalH += 24;
        }
    }

    let pauseH = 0;
    const pauseRaw = (row.pause || '').trim().toLowerCase().replace(',', '.');
    const pauseMatch = pauseRaw.match(/([\d.]+)/);
    if (pauseMatch) {
        const val = parseFloat(pauseMatch[1]);
        if (!isNaN(val)) {
            pauseH = (pauseRaw.includes('std') || pauseRaw.includes('h')) ? val : val / 60;
        }
    }

    return { total: totalH, pause: pauseH, net: totalH - pauseH };
};

window.formatHoursDecimal = function(h) {
    let str = (Math.round(h * 100) / 100).toFixed(2);
    if (str.endsWith('0')) str = str.slice(0, -1);
    return str.replace('.', ',');
};

window.buildWorkLogSummaryHtml = function(data) {
    const fmt = window.formatHoursDecimal;
    const parseKm = (v) => {
        const n = parseFloat(String(v || '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
        return isNaN(n) ? 0 : n;
    };
    const fmtKm = (n) => {
        const r = Math.round(n * 100) / 100;
        return (Number.isInteger(r) ? r : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
    };
    const days = {};
    data.forEach(row => {
        const datum = row.datum || '';
        if (!days[datum]) days[datum] = { anfahrt: 0, arbeitszeit: 0, abfahrt: 0, pause: 0, pauseAnfahrt: 0, pauseArbeitszeit: 0, pauseAbfahrt: 0, kmAnfahrt: 0, kmAbfahrt: 0 };
        const { net, pause } = window.computeWorkLogDuration(row);
        if (row.typ === 'Anfahrt') { days[datum].anfahrt += net; days[datum].pauseAnfahrt += pause; days[datum].kmAnfahrt += parseKm(row.kilometer); }
        else if (row.typ === 'Abfahrt') { days[datum].abfahrt += net; days[datum].pauseAbfahrt += pause; days[datum].kmAbfahrt += parseKm(row.kilometer); }
        else { days[datum].arbeitszeit += net; days[datum].pauseArbeitszeit += pause; }
        days[datum].pause += pause;
    });

    const MAX_REGULAR_HOURS = 8;
    const sortedDates = Object.keys(days).sort();
    let html = '';
    let grandTotal = 0;
    let totalOvertime = 0;
    let totalFahrzeit = 0;
    let totalLegalPause = 0;
    let totalPause = 0;
    let totalKm = 0;

    sortedDates.forEach(datum => {
        const d = days[datum];
        const dayTotal = d.anfahrt + d.arbeitszeit + d.abfahrt;
        grandTotal += dayTotal;
        totalFahrzeit += d.anfahrt + d.abfahrt;
        totalKm += d.kmAnfahrt + d.kmAbfahrt;

        let requiredPause = 0;
        let legalPauseSuffix = '';
        if (dayTotal > 9) {
            requiredPause = 0.75;
            legalPauseSuffix = ' (mehr als 9 Std.)';
        } else if (dayTotal > 6) {
            requiredPause = 0.5;
            legalPauseSuffix = ' (mehr als 6 Std.)';
        }
        const legalPause = Math.max(d.pause, requiredPause);

        const effectiveNet = dayTotal - (legalPause - d.pause);
        const overtime = Math.max(0, effectiveNet - MAX_REGULAR_HOURS);
        totalOvertime += overtime;
        totalLegalPause += legalPause;
        totalPause += d.pause;

        let dateLabel = 'Ohne Datum';
        if (datum) {
            const parts = datum.split('-');
            if (parts.length === 3) dateLabel = `${parts[2]}.${parts[1]}.${parts[0]}`;
        }

        html += `
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 14px;">
                <div style="font-weight: 700; margin-bottom: 6px;">${dateLabel}</div>
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.75); display: flex; flex-direction: column; gap: 2px;">
                    <span><span style="font-weight: 700;">Anfahrt: ${fmt(d.anfahrt)} Std.</span> (Pause Anfahrt: ${fmt(d.pauseAnfahrt)} Std.)${d.kmAnfahrt ? ` · ${fmtKm(d.kmAnfahrt)} km` : ''}</span>
                    <span><span style="font-weight: 700;">Arbeitszeit: ${fmt(d.arbeitszeit)} Std.</span> (Pause Arbeitszeit: ${fmt(d.pauseArbeitszeit)} Std.)</span>
                    <span><span style="font-weight: 700;">Abfahrt: ${fmt(d.abfahrt)} Std.</span> (Pause Abfahrt: ${fmt(d.pauseAbfahrt)} Std.)${d.kmAbfahrt ? ` · ${fmtKm(d.kmAbfahrt)} km` : ''}</span>
                    <span style="font-size: 1rem; font-weight: 700;"><span style="color: #fff;">Gesamt: ${fmt(dayTotal + d.pause)} Std.</span> (Pause gesamt: ${fmt(d.pause)} Std.)</span>
                    <span style="font-size: 1rem; font-weight: 700; color: #3b82f6;">Gesetzliche Pause${legalPauseSuffix}: ${fmt(legalPause)} Std.</span>
                    <span style="font-size: 1rem; font-weight: 700; color: #ef4444;">Überstunden, ab 9. Std. abzgl. gesetzlichen Pausen: ${fmt(overtime)} Std.</span>
                </div>
            </div>
        `;
    });

    if (sortedDates.length === 0) {
        html = '<div style="color: rgba(255,255,255,0.5); text-align: center; padding: 1rem;">Keine Einträge vorhanden.</div>';
    } else {
        html += `
            <div style="border-top: 1.5px solid rgba(255,255,255,0.15); margin-top: 4px; padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 800; font-size: 1.05rem;">Gesamte Arbeitszeit alle Tage</span>
                <span style="font-weight: 800; font-size: 1.05rem; color: #fff;">${fmt(grandTotal + totalPause)} Std.</span>
            </div>
            <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: var(--color-primary-green);">Gesamtfahrzeit</span>
                    <span style="font-weight: 700; color: var(--color-primary-green);">${fmt(totalFahrzeit)} Std.</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: var(--color-primary-green);">Überstunden (abzgl. gesetzlichen Pausen, ab 9 Std.)</span>
                    <span style="font-weight: 700; color: var(--color-primary-green);">${fmt(totalOvertime)} Std.</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: var(--color-primary-green);">Servicestunden</span>
                    <span style="font-weight: 700; color: var(--color-primary-green);">${fmt((grandTotal + totalPause) - totalOvertime - totalFahrzeit)} Std.</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: #fff;">Gesamt gefahrene Kilometer</span>
                    <span style="font-weight: 800; color: #fff;">${fmtKm(totalKm)} km</span>
                </div>
                <div style="text-align: center; color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-top: 4px;">
                    (Gesamt gesetzliche Pause: ${fmt(totalLegalPause)} Std.)
                </div>
                <div style="text-align: center; color: rgba(255,255,255,0.6); font-size: 0.85rem;">
                    (Gesamt gesetzliche Arbeitszeit: ${fmt(sortedDates.length * MAX_REGULAR_HOURS)} Std.)
                </div>
            </div>
        `;
    }

    return html;
};

window.showWorkLogSummary = function() {
    const data = typeof window.getWorkLogTableData === 'function' ? window.getWorkLogTableData() : [];
    window.openWorkLogSummaryModal(window.buildWorkLogSummaryHtml(data));
};

window.showServiceQuickInfo = async function (id) {
    window.openWorkLogSummaryModal('<div style="color: rgba(255,255,255,0.5); text-align: center; padding: 1rem;">Lade Stundenübersicht...</div>');

    let full = null;
    try {
        if (window.offlineService) full = await window.offlineService.getCachedFullEntry(id);
    } catch (e) { }
    if (!full && navigator.onLine && window.supabaseClient) {
        try {
            const { data, error } = await window.supabaseClient
                .from('service_entries')
                .select('work_log, travel_distance_km, travel_time_minutes, hotel_company, hotel_street, hotel_zip, hotel_city, hotel_country')
                .eq('id', id)
                .single();
            if (!error) full = data;
        } catch (e) { console.error('Schnellauskunft: Laden fehlgeschlagen', e); }
    }

    const content = document.getElementById('work-log-summary-content');
    if (!content) return;

    if (!full) {
        content.innerHTML = '<div style="color: rgba(255,200,200,0.8); text-align: center; padding: 1rem;">Konnte nicht geladen werden (offline & nicht zwischengespeichert).</div>';
        return;
    }

    let workLog = Array.isArray(full.work_log) ? full.work_log : [];
    if (workLog.length === 0 && (full.travel_time_minutes || full.travel_distance_km)) {
        const mins = full.travel_time_minutes || 0;
        const h = Math.floor(mins / 60), m = mins % 60;
        const zeit = `00:00 - ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        workLog = [{ datum: '', typ: 'Anfahrt', zeit, pause: '', kilometer: full.travel_distance_km || '' }];
    }
    content.innerHTML = hotelHinweisHtml(full) + window.buildWorkLogSummaryHtml(workLog);
};

// Ist am Bericht ein Hotel hinterlegt, gehören Übernachtung und Spesen mit auf
// die Rechnung — beim Abrechnen nach der Stundenübersicht ging das unter.
function hotelHinweisHtml(entry) {
    if (!entry) return '';
    const teile = [entry.hotel_company, entry.hotel_street,
        [entry.hotel_zip, entry.hotel_city].filter(Boolean).join(' '), entry.hotel_country]
        .map(v => (v || '').trim()).filter(Boolean);
    if (!teile.length) return '';

    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `
    <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:1rem; padding:14px 16px; border-radius:12px;
                background:rgba(251,191,36,0.14); border:1px solid rgba(251,191,36,0.55); color:#fbbf24;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:1px;">
            <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"></path><path d="M2 16h20"></path>
            <path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"></path><circle cx="9" cy="7.5" r="1.5"></circle>
        </svg>
        <div>
            <div style="font-weight:800; font-size:1rem; letter-spacing:0.2px;">Übernachtungskosten und Spesen nicht vergessen!</div>
            <div style="margin-top:4px; font-size:0.85rem; color:rgba(255,255,255,0.75);">Hotel hinterlegt: ${esc(teile.join(', '))}</div>
        </div>
    </div>`;
}

window.openWorkLogSummaryModal = function(html) {
    const content = document.getElementById('work-log-summary-content');
    if (content) content.innerHTML = html;

    const modal = document.getElementById('work-log-summary-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
    }
};

window.closeWorkLogSummary = function() {
    const modal = document.getElementById('work-log-summary-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
};
