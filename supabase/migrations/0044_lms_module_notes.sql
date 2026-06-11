-- ============================================================
-- Catatan pribadi ADV per modul (catat sambil menonton/belajar)
-- ============================================================

CREATE TABLE IF NOT EXISTS lms_module_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES lms_program_enrollments(id) ON DELETE CASCADE,
  module_id     uuid NOT NULL REFERENCES lms_program_modules(id) ON DELETE CASCADE,
  content       text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, module_id)
);

ALTER TABLE lms_module_notes ENABLE ROW LEVEL SECURITY;

-- ADV hanya bisa mengelola catatan pada enrollment miliknya sendiri.
DROP POLICY IF EXISTS note_owner ON lms_module_notes;
CREATE POLICY note_owner ON lms_module_notes FOR ALL TO authenticated
  USING (enrollment_id IN (SELECT id FROM lms_program_enrollments WHERE user_id = auth.uid()))
  WITH CHECK (enrollment_id IN (SELECT id FROM lms_program_enrollments WHERE user_id = auth.uid()));
