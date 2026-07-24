ALTER TABLE internal_processes
    ADD COLUMN IF NOT EXISTS linked_service_report_id BIGINT REFERENCES service_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_processes_linked_service_report_id
    ON internal_processes(linked_service_report_id);
