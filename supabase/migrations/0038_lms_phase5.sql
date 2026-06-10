-- ============================================================
-- Phase 5: Dashboard & Progress Tracking
-- ============================================================

-- Milestones per program
CREATE TABLE IF NOT EXISTS lms_milestones (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id                uuid NOT NULL REFERENCES lms_programs(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  description               text,
  required_modules_completed int  NOT NULL DEFAULT 1,
  emoji                     text NOT NULL DEFAULT '🏆',
  order_index               int  NOT NULL DEFAULT 0,
  created_at                timestamptz DEFAULT now()
);

-- Milestone achievements per ADV enrollment
CREATE TABLE IF NOT EXISTS lms_adv_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES lms_program_enrollments(id) ON DELETE CASCADE,
  milestone_id  uuid NOT NULL REFERENCES lms_milestones(id) ON DELETE CASCADE,
  achieved_at   timestamptz DEFAULT now(),
  UNIQUE(enrollment_id, milestone_id)
);

-- RLS
ALTER TABLE lms_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_adv_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ms_select" ON lms_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "ms_write"  ON lms_milestones FOR ALL   USING (lms_my_role() IN ('manager','admin'));

CREATE POLICY "am_select" ON lms_adv_milestones FOR SELECT TO authenticated USING (
  lms_my_role() IN ('manager','admin') OR
  enrollment_id IN (SELECT id FROM lms_program_enrollments WHERE user_id = auth.uid())
);
-- Awarded by SECURITY DEFINER function, no direct insert policy needed for ADV

-- ── Functions ────────────────────────────────────────────────

-- Check and award any newly unlocked milestones
CREATE OR REPLACE FUNCTION lms_check_and_award_milestones(p_enrollment_id uuid)
RETURNS void AS $$
DECLARE
  v_program_id      uuid;
  v_completed_count int;
BEGIN
  SELECT program_id INTO v_program_id
  FROM lms_program_enrollments WHERE id = p_enrollment_id;

  SELECT COUNT(*) INTO v_completed_count
  FROM lms_module_progress
  WHERE enrollment_id = p_enrollment_id AND status = 'completed';

  INSERT INTO lms_adv_milestones (enrollment_id, milestone_id)
  SELECT p_enrollment_id, m.id
  FROM lms_milestones m
  WHERE m.program_id = v_program_id
    AND m.required_modules_completed <= v_completed_count
  ON CONFLICT (enrollment_id, milestone_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create lms_complete_module to also award milestones on completion
CREATE OR REPLACE FUNCTION lms_complete_module(
  p_enrollment_id uuid,
  p_module_id     uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_program_id     uuid;
  v_next_module_id uuid;
BEGIN
  UPDATE lms_module_progress
  SET status = 'completed', completed_at = now()
  WHERE enrollment_id = p_enrollment_id
    AND module_id     = p_module_id
    AND status        = 'in_progress';

  SELECT program_id INTO v_program_id
  FROM lms_program_enrollments WHERE id = p_enrollment_id;

  WITH ordered AS (
    SELECT m.id,
           ROW_NUMBER() OVER (ORDER BY ph.order_index, m.order_index) AS rn
    FROM lms_program_phases  ph
    JOIN lms_program_modules m ON m.phase_id = ph.id
    WHERE ph.program_id = v_program_id
  )
  SELECT id INTO v_next_module_id
  FROM ordered
  WHERE rn = (SELECT rn FROM ordered WHERE id = p_module_id) + 1;

  IF v_next_module_id IS NOT NULL THEN
    UPDATE lms_module_progress
    SET status = 'in_progress', started_at = now()
    WHERE enrollment_id = p_enrollment_id
      AND module_id     = v_next_module_id
      AND status        = 'locked';
  END IF;

  PERFORM lms_check_and_award_milestones(p_enrollment_id);
END $$;
