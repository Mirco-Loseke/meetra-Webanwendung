/**
 * Google Drive Migration Script for Meetra
 * 
 * This script migrates all files from Supabase Storage to Google Drive
 * via the 'google-drive-upload' Edge Function.
 */

async function migrateAllFiles() {
    console.log('🚀 Starting Google Drive Migration...');

    const tablesToMigrate = [
        { name: 'accounting', urlFields: ['document_url'] },
        { name: 'documents', urlFields: ['url'] },
        { name: 'manual_history_entries', jsonFields: ['files'] },
        { name: 'machines', urlFields: ['image_url'], jsonFields: ['images', 'files'] },
        { name: 'service_entries', jsonFields: ['files'] },
        { name: 'protocol_photos', urlFields: ['file_url'] },
        { name: 'procurements', urlFields: ['file_url'], jsonFields: ['files'] },
        { name: 'document_folders', urlFields: ['cover_url'] },
        { name: 'users', urlFields: ['photo'] }
    ];

    let totalMigrated = 0;
    let totalErrors = 0;

    for (const table of tablesToMigrate) {
        console.log(`\n--- Migrating table: ${table.name} ---`);
        
        const { data: records, error } = await supabaseClient.from(table.name).select('*');
        if (error) {
            console.error(`Error fetching records from ${table.name}:`, error);
            continue;
        }

        for (const record of records) {
            let recordNeedsUpdate = false;
            const updatedRecord = { ...record };

            // Handle simple URL fields
            if (table.urlFields) {
                for (const field of table.urlFields) {
                    const url = record[field];
                    if (isSupabaseUrl(url)) {
                        console.log(`Migrating ${table.name}.${field} for record ${record.id}...`);
                        const newUrl = await migrateFile(url, `${table.name}/${getYearMonth()}`);
                        if (newUrl) {
                            updatedRecord[field] = newUrl;
                            recordNeedsUpdate = true;
                        } else {
                            totalErrors++;
                        }
                    }
                }
            }

            // Handle JSONB fields (arrays)
            if (table.jsonFields) {
                for (const field of table.jsonFields) {
                    const files = record[field];
                    if (Array.isArray(files) && files.length > 0) {
                        const updatedFiles = [];
                        let fieldChanged = false;

                        for (const fileObj of files) {
                            // Can be string array or object array with .url
                            let url = typeof fileObj === 'string' ? fileObj : fileObj.url;
                            if (isSupabaseUrl(url)) {
                                console.log(`Migrating ${table.name}.${field} item for record ${record.id}...`);
                                const newUrl = await migrateFile(url, `${table.name}/${getYearMonth()}`);
                                if (newUrl) {
                                    if (typeof fileObj === 'string') {
                                        updatedFiles.push(newUrl);
                                    } else {
                                        updatedFiles.push({ ...fileObj, url: newUrl });
                                    }
                                    fieldChanged = true;
                                } else {
                                    updatedFiles.push(fileObj); // Keep original on error
                                    totalErrors++;
                                }
                            } else {
                                updatedFiles.push(fileObj);
                            }
                        }

                        if (fieldChanged) {
                            updatedRecord[field] = updatedFiles;
                            recordNeedsUpdate = true;
                        }
                    }
                }
            }

            if (recordNeedsUpdate) {
                const { error: updateErr } = await supabaseClient.from(table.name).update(updatedRecord).eq('id', record.id);
                if (updateErr) {
                    console.error(`Error updating record ${record.id} in ${table.name}:`, updateErr);
                    totalErrors++;
                } else {
                    totalMigrated++;
                }
            }
        }
    }

    console.log(`\n✅ Migration Finished!`);
    console.log(`Total Migrated: ${totalMigrated}`);
    console.log(`Total Errors: ${totalErrors}`);
}

function isSupabaseUrl(url) {
    return typeof url === 'string' && url.includes('rtnpyziwyaqrlfazxkyr.supabase.co/storage');
}

function getYearMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const months = ["Januar", "Februar", "Maerz", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    return `${year}/${month}_${months[now.getMonth()]}`;
}

async function migrateFile(supabaseUrl, targetPath) {
    try {
        // 1. Download from Supabase
        const res = await fetch(supabaseUrl);
        if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
        const blob = await res.blob();
        
        // Determine filename
        const filename = supabaseUrl.split('/').pop().split('?')[0] || 'file';

        // 2. Upload to Edge Function
        const fd = new FormData();
        fd.append('file', blob, filename);
        fd.append('folderPath', `Meetra_Storage/${targetPath}`);

        const uploadRes = await fetch('https://rtnpyziwyaqrlfazxkyr.supabase.co/functions/v1/google-drive-upload', {
            method: 'POST',
            body: fd
        });

        if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.statusText}`);
        const driveData = await uploadRes.json();
        
        console.log(`   -> Successfully migrated ${filename}`);
        return driveData.webViewLink;
    } catch (err) {
        console.error(`   ❌ Failed to migrate ${supabaseUrl}:`, err);
        return null;
    }
}

// Start migration
// migrateAllFiles();
