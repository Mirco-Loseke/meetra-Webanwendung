-- 1. SUPERGROUP TEMPLATES (Übergruppen)
CREATE TABLE IF NOT EXISTS task_supergroups_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. SUBTASK TEMPLATES (Unteraufgaben-Bausteine)
CREATE TABLE IF NOT EXISTS task_subtask_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL UNIQUE,
    action_type TEXT, -- 'intake', 'acceptance', etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. QUICK TEMPLATES (Schnellvorlagen)
CREATE TABLE IF NOT EXISTS task_quick_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    structure JSONB NOT NULL, -- Array of {name: "Group", subtasks: ["ST1", "ST2"]}
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. UPDATE EXISTING TABLES
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS supergroup TEXT;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS action_type TEXT;

-- 5. ENABLE RLS
ALTER TABLE task_supergroups_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_subtask_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_quick_templates ENABLE ROW LEVEL SECURITY;

-- 6. POLICIES
DROP POLICY IF EXISTS "Enable all for everyone" ON task_supergroups_templates;
CREATE POLICY "Enable all for everyone" ON task_supergroups_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for everyone" ON task_subtask_templates;
CREATE POLICY "Enable all for everyone" ON task_subtask_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for everyone" ON task_quick_templates;
CREATE POLICY "Enable all for everyone" ON task_quick_templates FOR ALL USING (true) WITH CHECK (true);
