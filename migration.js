window.runR2Migration = async function() {
    console.log("Starting Cloudflare R2 Migration...");
    
    // Helper to get folder name
    function getMachineFolderName(id, manufacturer, name, year) {
        const cleanMan = (manufacturer || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
        const cleanName = (name || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
        const yearStr = year ? `_Baujahr_${year}` : '';
        return `Maschinen/${id}_${cleanMan}_${cleanName}${yearStr}`;
    }

    try {
        // 1. Fetch all machines
        console.log("Fetching machines...");
        const { data: machines, error: mError } = await window.supabaseClient
            .from('machines')
            .select('*');

        if (mError) throw mError;
        console.log(`Found ${machines.length} machines.`);

        for (const m of machines) {
            console.log(`Processing machine ID ${m.id} (${m.manufacturer} ${m.name})...`);
            const folderName = getMachineFolderName(m.id, m.manufacturer, m.name, m.year);
            
            // Migrate Avatar/image_url
            if (m.image_url && m.image_url.includes('supabase.co')) {
                console.log(`- Migrating avatar: ${m.image_url}`);
                try {
                    const res = await fetch(m.image_url);
                    const blob = await res.blob();
                    const fileExt = m.image_url.split('.').pop().split('?')[0] || 'jpg';
                    const filename = `avatar_${Date.now()}.${fileExt}`;
                    const path = `${folderName}/Vorschaubilder/${filename}`;

                    const uploadRes = await window.FileUploadService.uploadFile(
                        new File([blob], filename, { type: blob.type }), 
                        { bucket: 'dateien', path: path, compress: false, provider: 'cloudflare-r2' }
                    );

                    console.log(`  Uploaded avatar to R2: ${uploadRes.url}`);
                    const { error: updErr } = await window.supabaseClient
                        .from('machines')
                        .update({ image_url: uploadRes.url })
                        .eq('id', m.id);

                    if (updErr) throw updErr;
                } catch (e) {
                    console.error(`  Failed to migrate avatar for machine ${m.id}:`, e);
                }
            }

            // Migrate files array
            if (m.files && Array.isArray(m.files) && m.files.length > 0) {
                let updatedFiles = [];
                let changed = false;

                for (const file of m.files) {
                    if (file.url && file.url.includes('supabase.co')) {
                        console.log(`- Migrating machine file: ${file.name} (${file.url})`);
                        try {
                            const res = await fetch(file.url);
                            const blob = await res.blob();
                            const isImg = file.type && file.type.startsWith('image/');
                            const subfolder = isImg ? 'Vorschaubilder' : 'Dokumente';
                            const fileExt = file.name.split('.').pop() || 'pdf';
                            const cleanName = file.name.split('.').slice(0, -1).join('.').replace(/[^a-zA-Z0-9_\- ]/g, '_');
                            const path = `${folderName}/${subfolder}/${cleanName}_${Date.now()}.${fileExt}`;

                            const uploadRes = await window.FileUploadService.uploadFile(
                                new File([blob], file.name, { type: blob.type }),
                                { bucket: 'dateien', path: path, compress: false, provider: 'cloudflare-r2' }
                            );

                            updatedFiles.push({
                                name: file.name,
                                type: file.type,
                                url: uploadRes.url
                            });
                            changed = true;
                            console.log(`  Uploaded file to R2: ${uploadRes.url}`);
                        } catch (e) {
                            console.error(`  Failed to migrate file ${file.name}:`, e);
                            updatedFiles.push(file); // keep old
                        }
                    } else {
                        updatedFiles.push(file);
                    }
                }

                if (changed) {
                    const { error: updErr } = await window.supabaseClient
                        .from('machines')
                        .update({ files: updatedFiles })
                        .eq('id', m.id);

                    if (updErr) throw updErr;
                }
            }
        }

        // 2. Fetch all manual history entries
        console.log("Fetching history entries...");
        const { data: history, error: hError } = await window.supabaseClient
            .from('manual_history_entries')
            .select('*');

        if (hError) throw hError;
        console.log(`Found ${history.length} history entries.`);

        for (const h of history) {
            if (h.files && Array.isArray(h.files) && h.files.length > 0) {
                let updatedUrls = [];
                let changed = false;

                // Find machine details for naming the folder
                const machine = machines.find(m => m.id === h.machine_id);
                if (!machine) continue;
                const folderName = getMachineFolderName(machine.id, machine.manufacturer, machine.name, machine.year);

                for (const url of h.files) {
                    if (url && url.includes('supabase.co')) {
                        console.log(`- Migrating history photo: ${url}`);
                        try {
                            const res = await fetch(url);
                            const blob = await res.blob();
                            const fileExt = url.split('.').pop().split('?')[0] || 'jpg';
                            const filename = `history_${Date.now()}.${fileExt}`;
                            const path = `${folderName}/Verlauf/${filename}`;

                            const uploadRes = await window.FileUploadService.uploadFile(
                                new File([blob], filename, { type: blob.type }),
                                { bucket: 'dateien', path: path, compress: false, provider: 'cloudflare-r2' }
                            );

                            updatedUrls.push(uploadRes.url);
                            changed = true;
                            console.log(`  Uploaded history photo to R2: ${uploadRes.url}`);
                        } catch (e) {
                            console.error(`  Failed to migrate history photo:`, e);
                            updatedUrls.push(url);
                        }
                    } else {
                        updatedUrls.push(url);
                    }
                }

                if (changed) {
                    const { error: updErr } = await window.supabaseClient
                        .from('manual_history_entries')
                        .update({ files: updatedUrls })
                        .eq('id', h.id);

                    if (updErr) throw updErr;
                }
            }
        }

        console.log("Migration successfully finished!");
        alert("Migration erfolgreich beendet! Siehe Browser-Konsole für Details.");
    } catch (err) {
        console.error("Migration failed:", err);
        alert("Migration fehlgeschlagen: " + err.message);
    }
};
