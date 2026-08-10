// ==========================================================
// Kunden-Autovervollstaendigung und automatische Zuordnung (Name, Adresse, Seriennummer)
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 15852-16051).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        window.setupCustomerAutocomplete = function(inputId, suggestionsId, modalType) {
            const input = document.getElementById(inputId);
            const suggestionsBox = document.getElementById(suggestionsId);
            if (!input || !suggestionsBox) return;

            let timeout = null;

            input.addEventListener('input', () => {
                clearTimeout(timeout);
                const query = input.value.trim();
                if (query.length < 2) {
                    suggestionsBox.style.display = 'none';
                    suggestionsBox.innerHTML = '';
                    return;
                }

                timeout = setTimeout(async () => {
                    try {
                        if (!window.supabaseClient) return;
                        
                        const { data, error } = await window.supabaseClient
                            .from('customers')
                            .select('id, name, email, matchcode, customer_number, city')
                            .or(`name.ilike.%${query}%,matchcode.ilike.%${query}%,email.ilike.%${query}%`)
                            .limit(8);

                        if (error) throw error;

                        suggestionsBox.innerHTML = '';
                        if (!data || data.length === 0) {
                            const noResults = document.createElement('div');
                            noResults.style.cssText = 'padding: 10px; color: rgba(255, 255, 255, 0.4); text-align: center; font-size: 0.9rem;';
                            noResults.innerText = 'Keine Kunden gefunden';
                            suggestionsBox.appendChild(noResults);
                            suggestionsBox.style.display = 'block';
                            return;
                        }

                        data.forEach(cust => {
                            const item = document.createElement('div');
                            item.className = 'autocomplete-suggestion-item';

                            const nameLabel = cust.matchcode ? `[${cust.matchcode}] ${cust.name}` : cust.name;
                            let detailText = cust.email ? cust.email : '';
                            if (cust.customer_number) {
                                detailText = `Nr. ${cust.customer_number}` + (detailText ? ` - ${detailText}` : '');
                            }
                            if (cust.city) {
                                detailText += (detailText ? ` (${cust.city})` : cust.city);
                            }

                            item.innerHTML = `
                                <div class="cust-name">${nameLabel}</div>
                                <div class="cust-details">${detailText}</div>
                            `;

                            item.onclick = (e) => {
                                e.stopPropagation();
                                input.value = cust.email ? `${cust.name} <${cust.email}>` : cust.name;
                                suggestionsBox.style.display = 'none';
                                suggestionsBox.innerHTML = '';

                                window.filterMachinesForCustomer(cust.id, cust.name, modalType);
                            };

                            suggestionsBox.appendChild(item);
                        });
                        suggestionsBox.style.display = 'block';
                    } catch (err) {
                        console.error("Autocomplete customer search error:", err);
                        suggestionsBox.innerHTML = '<div style="padding: 10px; color: #f87171; text-align: center; font-size: 0.9rem;">Fehler bei der Suche</div>';
                        suggestionsBox.style.display = 'block';
                    }
                }, 200);
            });

            // Close suggestions when clicking outside
            document.addEventListener('click', (e) => {
                if (e.target !== input && !suggestionsBox.contains(e.target)) {
                    suggestionsBox.style.display = 'none';
                    suggestionsBox.innerHTML = '';
                }
            });
        };

        window.syncAddressFromMachine = async function(machineSelectId, typeSelectId, senderInputId, recipientInputId) {
            const select = document.getElementById(machineSelectId);
            if (!select) return;
            const val = select.value;
            if (!val) return;

            const type = document.getElementById(typeSelectId)?.value || 'email_incoming';
            const machine = (window.machineList || []).find(m => String(m.id) === String(val));
            if (!machine || !machine.customer_id) return;

            try {
                if (!window.supabaseClient) return;
                const { data: customer, error } = await window.supabaseClient
                    .from('customers')
                    .select('id, name, email')
                    .eq('id', machine.customer_id)
                    .maybeSingle();

                if (error) throw error;
                if (!customer) return;

                const displayVal = customer.email ? `${customer.name} <${customer.email}>` : customer.name;
                
                if (type === 'email_incoming') {
                    const senderInput = document.getElementById(senderInputId);
                    if (senderInput) {
                        senderInput.value = displayVal;
                    }
                } else if (type === 'email_outgoing') {
                    const recipientInput = document.getElementById(recipientInputId);
                    if (recipientInput) {
                        recipientInput.value = displayVal;
                    }
                }
            } catch (err) {
                console.error("Error syncing address from machine:", err);
            }
        };

        window.runSmartCustomerMatching = async function(senderEmail, text, prefix) {
            prefix = prefix || 'email';
            const genericDomains = ['gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'web.de', 't-online.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'yahoo.com', 'yahoo.de', 'aol.com', 'icloud.com', 'mail.ru', 'freenet.de', 'directbox.com', 'posteo.de', 'gmx.at', 'gmx.ch'];
            
            if (!supabaseClient) return;
            
            try {
                let customer = null;
                
                // 1. Exact match
                const { data: exactCust } = await supabaseClient
                    .from('customers')
                    .select('id, name')
                    .eq('email', senderEmail)
                    .maybeSingle();
                    
                if (exactCust) {
                    customer = exactCust;
                } else {
                    // 2. Domain match
                    const domain = senderEmail.split('@')[1];
                    if (domain && !genericDomains.includes(domain.toLowerCase())) {
                        const { data: domainCusts } = await supabaseClient
                            .from('customers')
                            .select('id, name')
                            .ilike('email', `%@${domain}`)
                            .limit(1);
                        if (domainCusts && domainCusts.length > 0) {
                            customer = domainCusts[0];
                        }
                    }
                }
                
                if (customer) {
                    const machines = (window.machineList || []).filter(m => m.customer_id === customer.id);
                    if (machines.length > 0) {
                        window.processMachineRecommended[prefix] = machines.map(m => m.id);
                        window.runSerialNumberMatching(text, machines[0].id, prefix);
                        return;
                    }
                }

                window.processMachineRecommended[prefix] = [];
                window.runSerialNumberMatching(text, null, prefix);

            } catch (e) {
                console.error("Error in Smart Customer Matching:", e);
                window.runSerialNumberMatching(text, null, prefix);
            }
        };

        window.runSerialNumberMatching = function(text, defaultMachineId, prefix) {
            prefix = prefix || 'email';
            let matchedMachine = null;

            // Scan for serials
            for (const m of (window.machineList || [])) {
                if (m.serial && m.serial.length >= 3) {
                    const escaped = m.serial.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp('\\b' + escaped + '\\b', 'i');
                    if (regex.test(text)) {
                        matchedMachine = m;
                        break;
                    }
                }
            }

            const targetId = matchedMachine ? matchedMachine.id : (defaultMachineId || '');
            if (targetId) {
                const machine = matchedMachine || (window.machineList || []).find(m => String(m.id) === String(targetId));
                const label = machine ? window.processMachineLabel(machine) : '';
                window.selectProcessMachine(prefix, targetId, label);
            } else {
                window.selectProcessMachine(prefix, '', '');
            }
        };
