-- ============================================================
-- H4: Buka modul deterministik + reconcile saat selesai
-- ============================================================
-- order_index bisa sama antar modul → ROW_NUMBER non-deterministik bisa
-- meng-skip prasyarat / tak membuka modul. Tambah tiebreaker (created_at, id).
-- lms_complete_module kini memakai reconcile (bukan rn+1) agar tahan gap.

CREATE OR REPLACE FUNCTION lms_reconcile_progress(p_enrollment_id uuid)
RETURNS void AS $fn$
DECLARE
  v_program_id  uuid;
  v_next_module uuid;
BEGIN
  SELECT program_id INTO v_program_id
  FROM lms_program_enrollments WHERE id = p_enrollment_id;
  IF v_program_id IS NULL THEN RETURN; END IF;

  INSERT INTO lms_module_progress (enrollment_id, module_id, status)
  SELECT p_enrollment_id, m.id, 'locked'
  FROM lms_program_modules m
  JOIN lms_program_phases ph ON ph.id = m.phase_id
  WHERE ph.program_id = v_program_id
  ON CONFLICT (enrollment_id, module_id) DO NOTHING;

  WITH ordered AS (
    SELECT mp.module_id, mp.status,
           ROW_NUMBER() OVER (ORDER BY ph.order_index, m.order_index, m.created_at, m.id) AS rn
    FROM lms_module_progress mp
    JOIN lms_program_modules m  ON m.id = mp.module_id
    JOIN lms_program_phases  ph ON ph.id = m.phase_id
    WHERE mp.enrollment_id = p_enrollment_id
      AND ph.program_id = v_program_id
  )
  SELECT module_id INTO v_next_module
  FROM ordered
  WHERE status <> 'completed'
  ORDER BY rn
  LIMIT 1;

  IF v_next_module IS NOT NULL THEN
    UPDATE lms_module_progress
    SET status = 'in_progress', started_at = COALESCE(started_at, now())
    WHERE enrollment_id = p_enrollment_id
      AND module_id = v_next_module
      AND status = 'locked';
  END IF;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- Selesaikan modul → buka modul layak berikutnya (deterministik) + award milestone.
CREATE OR REPLACE FUNCTION lms_complete_module(p_enrollment_id uuid, p_module_id uuid)
RETURNS void AS $fn$
BEGIN
  UPDATE lms_module_progress
  SET status = 'completed', completed_at = now()
  WHERE enrollment_id = p_enrollment_id
    AND module_id = p_module_id
    AND status = 'in_progress';

  PERFORM lms_reconcile_progress(p_enrollment_id);
  PERFORM lms_check_and_award_milestones(p_enrollment_id);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
