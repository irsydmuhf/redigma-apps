-- ============================================================
-- Phase 6: Milestones final + approval manual + sertifikat
-- ============================================================

-- Tandai milestone "final" (kelulusan) yang butuh approval manual Manager
ALTER TABLE lms_milestones
  ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;

-- Status pencapaian + data approval + sertifikat per ADV
ALTER TABLE lms_adv_milestones
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'achieved',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS certificate_url text;

-- Constraint status (drop dulu kalau sudah ada agar idempotent)
ALTER TABLE lms_adv_milestones DROP CONSTRAINT IF EXISTS lms_adv_milestones_status_check;
ALTER TABLE lms_adv_milestones
  ADD CONSTRAINT lms_adv_milestones_status_check
  CHECK (status IN ('achieved', 'pending_approval', 'approved', 'rejected'));

-- ── Recreate award function ──────────────────────────────────
-- Milestone biasa  → langsung 'achieved'
-- Milestone final  → 'pending_approval' (Manager harus approve manual)
CREATE OR REPLACE FUNCTION lms_check_and_award_milestones(p_enrollment_id uuid)
RETURNS void AS $fn$
DECLARE
  v_program_id      uuid;
  v_completed_count int;
BEGIN
  SELECT program_id INTO v_program_id
  FROM lms_program_enrollments WHERE id = p_enrollment_id;

  SELECT COUNT(*) INTO v_completed_count
  FROM lms_module_progress
  WHERE enrollment_id = p_enrollment_id AND status = 'completed';

  INSERT INTO lms_adv_milestones (enrollment_id, milestone_id, status)
  SELECT
    p_enrollment_id,
    m.id,
    CASE WHEN m.is_final THEN 'pending_approval' ELSE 'achieved' END
  FROM lms_milestones m
  WHERE m.program_id = v_program_id
    AND m.required_modules_completed <= v_completed_count
  ON CONFLICT (enrollment_id, milestone_id) DO NOTHING;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
