// ==========================================================
// Servicebericht: Arbeitszeiten- und Materialtabellen, Zusammenfassung
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 5374-5483).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
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

        window.addTasksTableRow = function(data = null) {
            const tbody = document.getElementById('service-tasks-table-body');
            if (!tbody) return;
            
            const taskVal = data?.task || '';
            const completedVal = data?.completed ? 'checked' : '';
            
            const tr = document.createElement('tr');
            tr.className = 'service-tasks-row';
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            tr.innerHTML = `
                <td style="padding: 6px;">
                    <input type="text" class="glass-form-input task-desc" value="${taskVal}" placeholder="z.B. Filter gewechselt" style="padding: 6px 10px; height: 36px; border-radius: 8px; font-size: 0.85rem; width: 100%;">
                </td>
                <td style="padding: 6px; text-align: center; vertical-align: middle;">
                    <input type="checkbox" class="task-completed" ${completedVal} style="width: 18px; height: 18px; accent-color: var(--color-primary-green); cursor: pointer; display: inline-block; margin: 0 auto;">
                </td>
                <td style="padding: 6px; text-align: center;">
                    <button type="button" class="btn-icon-circular delete" onclick="this.closest('tr').remove()" style="background: rgba(239, 68, 68, 0.1); border: 1.5px solid rgba(239, 68, 68, 0.2); color: #ef4444; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        };
        
        window.getTasksTableData = function() {
            const rows = document.querySelectorAll('.service-tasks-row');
            const data = [];
            rows.forEach(tr => {
                const task = tr.querySelector('.task-desc')?.value.trim() || '';
                const completed = tr.querySelector('.task-completed')?.checked || false;
                if (task) {
                    data.push({ task, completed });
                }
            });
            return data;
        };

        window.addMaterialsTableRow = function(data = null) {
            const tbody = document.getElementById('service-materials-table-body');
            if (!tbody) return;
            
            const artNum = data?.article_number || '';
            const desc = data?.description || '';
            const qty = data?.quantity || '';
            
            const tr = document.createElement('tr');
            tr.className = 'service-materials-row';
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            tr.innerHTML = `
                <td style="padding: 6px;">
                    <input type="text" class="glass-form-input material-artnum" value="${artNum}" placeholder="z.B. 12345678" maxlength="8" oninput="this.value=this.value.replace(/[^0-9]/g,'')" style="padding: 6px 10px; height: 36px; border-radius: 8px; font-size: 0.85rem; width: 100%;">
                </td>
                <td style="padding: 6px;">
                    <input type="text" class="glass-form-input material-desc" value="${desc}" placeholder="z.B. Ölfilter" style="padding: 6px 10px; height: 36px; border-radius: 8px; font-size: 0.85rem; width: 100%;">
                </td>
                <td style="padding: 6px;">
                    <input type="text" class="glass-form-input material-qty" value="${qty}" placeholder="z.B. 2 Stk" style="padding: 6px 10px; height: 36px; border-radius: 8px; font-size: 0.85rem; width: 100%;">
                </td>
                <td style="padding: 6px; text-align: center;">
                    <button type="button" class="btn-icon-circular delete" onclick="this.closest('tr').remove()" style="background: rgba(239, 68, 68, 0.1); border: 1.5px solid rgba(239, 68, 68, 0.2); color: #ef4444; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        };
        
        window.getMaterialsTableData = function() {
            const rows = document.querySelectorAll('.service-materials-row');
            const data = [];
            rows.forEach(tr => {
                const article_number = tr.querySelector('.material-artnum')?.value.trim() || '';
                const description = tr.querySelector('.material-desc')?.value.trim() || '';
                const quantity = tr.querySelector('.material-qty')?.value.trim() || '';
                if (article_number || description || quantity) {
                    data.push({ article_number, description, quantity });
                }
            });
            return data;
        };

        // Signature Canvas State
