-- ============================================================
-- Fix: modul baru tetap terkunci untuk ADV yang sudah berjalan
-- ============================================================
-- Saat manager menambah modul SETELAH ADV mulai/selesai modul lain,
-- enrollment lama tidak punya progress row untuk modul baru → tampil
-- "Terkunci" selamanya. Fungsi reconcile memperbaikinya.

CREATE OR REPLACE FUNCTION lms_reconcile_progress(p_enrollment_id uuid)
RETURNS void AS $fn$
DECLARE
  v_program_id  uuid;
  v_next_module uuid;
BEGIN
  SELECT program_id INTO v_program_id
  FROM lms_program_enrollments WHERE id = p_enrollment_id;
  IF v_program_id IS NULL THEN RETURN; END IF;

  -- Pastikan setiap modul program punya progress row (default 'locked').
  INSERT INTO lms_module_progress (enrollment_id, module_id, status)
  SELECT p_enrollment_id, m.id, 'locked'
  FROM lms_program_modules m
  JOIN lms_program_phases ph ON ph.id = m.phase_id
  WHERE ph.program_id = v_program_id
  ON CONFLICT (enrollment_id, module_id) DO NOTHING;

  -- Modul pertama (urutan kurikulum) yang belum 'completed'.
  WITH ordered AS (
    SELECT mp.module_id, mp.status,
           ROW_NUMBER() OVER (ORDER BY ph.order_index, m.order_index) AS rn
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

  -- Buka modul itu kalau masih terkunci (modul sebelumnya semua sudah selesai).
  IF v_next_module IS NOT NULL THEN
    UPDATE lms_module_progress
    SET status = 'in_progress', started_at = COALESCE(started_at, now())
    WHERE enrollment_id = p_enrollment_id
      AND module_id = v_next_module
      AND status = 'locked';
  END IF;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- Perbaiki semua enrollment yang sudah berjalan (active + completed).
SELECT lms_reconcile_progress(id)
FROM lms_program_enrollments
WHERE status IN ('active', 'completed');
