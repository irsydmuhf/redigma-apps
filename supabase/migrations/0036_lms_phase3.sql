-- LMS Phase 3: Task Submission & Module Completion

CREATE TABLE IF NOT EXISTS lms_task_submissions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    uuid        NOT NULL REFERENCES lms_program_enrollments(id) ON DELETE CASCADE,
  task_id          uuid        NOT NULL REFERENCES lms_module_tasks(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  screenshot_url   text,
  link_url         text,
  notes            text,
  feedback_comment text,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE lms_task_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lms: adv baca submission sendiri"
  ON lms_task_submissions FOR SELECT TO authenticated
  USING (enrollment_id IN (
    SELECT id FROM lms_program_enrollments WHERE user_id = auth.uid()
  ));

CREATE POLICY "lms: adv insert submission"
  ON lms_task_submissions FOR INSERT TO authenticated
  WITH CHECK (enrollment_id IN (
    SELECT id FROM lms_program_enrollments
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "lms: manager & admin CRUD submission"
  ON lms_task_submissions FOR ALL TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'))
  WITH CHECK (lms_my_role() IN ('manager', 'admin'));

CREATE POLICY "lms: service role manage submissions"
  ON lms_task_submissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- FUNCTION: Cek module completion & unlock modul berikutnya
-- ============================================================
CREATE OR REPLACE FUNCTION lms_check_module_completion(
  p_enrollment_id uuid,
  p_module_id     uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_tasks    int;
  v_approved_tasks int;
  v_program_id     uuid;
  v_next_module_id uuid;
BEGIN
  -- Hitung total task di modul ini
  SELECT COUNT(*) INTO v_total_tasks
  FROM lms_module_tasks WHERE module_id = p_module_id;

  -- Jika tidak ada task, modul langsung complete
  IF v_total_tasks = 0 THEN
    PERFORM lms_complete_module(p_enrollment_id, p_module_id);
    RETURN;
  END IF;

  -- Hitung task yang sudah approved (submission terbaru per task)
  SELECT COUNT(DISTINCT t.id) INTO v_approved_tasks
  FROM lms_module_tasks t
  WHERE t.module_id = p_module_id
    AND EXISTS (
      SELECT 1 FROM lms_task_submissions s
      WHERE s.task_id      = t.id
        AND s.enrollment_id = p_enrollment_id
        AND s.status        = 'approved'
    );

  IF v_approved_tasks >= v_total_tasks THEN
    PERFORM lms_complete_module(p_enrollment_id, p_module_id);
  END IF;
END $$;

-- Helper: mark modul selesai & unlock berikutnya
CREATE OR REPLACE FUNCTION lms_complete_module(
  p_enrollment_id uuid,
  p_module_id     uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_program_id     uuid;
  v_next_module_id uuid;
BEGIN
  -- Tandai modul selesai
  UPDATE lms_module_progress
  SET status = 'completed', completed_at = now()
  WHERE enrollment_id = p_enrollment_id
    AND module_id     = p_module_id
    AND status        = 'in_progress';

  -- Ambil program_id dari enrollment
  SELECT program_id INTO v_program_id
  FROM lms_program_enrollments WHERE id = p_enrollment_id;

  -- Cari modul berikutnya berdasarkan urutan (phase.order_index, module.order_index)
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

  -- Unlock modul berikutnya jika ada
  IF v_next_module_id IS NOT NULL THEN
    UPDATE lms_module_progress
    SET status = 'in_progress', started_at = now()
    WHERE enrollment_id = p_enrollment_id
      AND module_id     = v_next_module_id
      AND status        = 'locked';
  END IF;
END $$;
