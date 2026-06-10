-- LMS Phase 2: Program Builder
-- Tambah struktur kurikulum: phases → modules → content + tasks
-- Tambah module_progress untuk tracking status per ADV

-- ============================================================
-- TABEL
-- ============================================================

CREATE TABLE IF NOT EXISTS lms_program_phases (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id    uuid        NOT NULL REFERENCES lms_programs(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  order_index   int         NOT NULL DEFAULT 0,
  duration_days int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lms_program_modules (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id       uuid        NOT NULL REFERENCES lms_program_phases(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  description    text,
  order_index    int         NOT NULL DEFAULT 0,
  estimated_days int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lms_module_content (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    uuid        NOT NULL REFERENCES lms_program_modules(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('text', 'video', 'file')),
  content_text text,
  video_url    text,
  file_url     text,
  file_name    text,
  order_index  int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lms_module_tasks (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id          uuid        NOT NULL REFERENCES lms_program_modules(id) ON DELETE CASCADE,
  title              text        NOT NULL,
  description        text,
  requires_screenshot boolean    NOT NULL DEFAULT false,
  requires_link       boolean    NOT NULL DEFAULT false,
  order_index        int         NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Status modul per enrollment ADV
CREATE TABLE IF NOT EXISTS lms_module_progress (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid        NOT NULL REFERENCES lms_program_enrollments(id) ON DELETE CASCADE,
  module_id     uuid        NOT NULL REFERENCES lms_program_modules(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'locked'
                            CHECK (status IN ('locked', 'in_progress', 'completed')),
  started_at    timestamptz,
  completed_at  timestamptz,
  UNIQUE (enrollment_id, module_id)
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE lms_program_phases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_program_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_module_content  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_module_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_module_progress ENABLE ROW LEVEL SECURITY;

-- Phases
CREATE POLICY "lms: manager & admin CRUD phases"
  ON lms_program_phases FOR ALL TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'))
  WITH CHECK (lms_my_role() IN ('manager', 'admin'));

CREATE POLICY "lms: adv baca phases program aktif"
  ON lms_program_phases FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lms_program_enrollments e
      WHERE e.program_id = lms_program_phases.program_id
        AND e.user_id    = auth.uid()
        AND e.status     = 'active'
    )
  );

-- Modules
CREATE POLICY "lms: manager & admin CRUD modules"
  ON lms_program_modules FOR ALL TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'))
  WITH CHECK (lms_my_role() IN ('manager', 'admin'));

CREATE POLICY "lms: adv baca modules phase aktif"
  ON lms_program_modules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM lms_program_phases ph
      JOIN lms_program_enrollments e ON e.program_id = ph.program_id
      WHERE ph.id         = lms_program_modules.phase_id
        AND e.user_id     = auth.uid()
        AND e.status      = 'active'
    )
  );

-- Content
CREATE POLICY "lms: manager & admin CRUD content"
  ON lms_module_content FOR ALL TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'))
  WITH CHECK (lms_my_role() IN ('manager', 'admin'));

CREATE POLICY "lms: adv baca content modul aktif"
  ON lms_module_content FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM lms_module_progress mp
      WHERE mp.module_id = lms_module_content.module_id
        AND mp.enrollment_id IN (
          SELECT id FROM lms_program_enrollments
          WHERE user_id = auth.uid() AND status = 'active'
        )
        AND mp.status != 'locked'
    )
  );

-- Tasks
CREATE POLICY "lms: manager & admin CRUD tasks"
  ON lms_module_tasks FOR ALL TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'))
  WITH CHECK (lms_my_role() IN ('manager', 'admin'));

CREATE POLICY "lms: adv baca tasks modul aktif"
  ON lms_module_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM lms_module_progress mp
      WHERE mp.module_id = lms_module_tasks.module_id
        AND mp.enrollment_id IN (
          SELECT id FROM lms_program_enrollments
          WHERE user_id = auth.uid() AND status = 'active'
        )
        AND mp.status != 'locked'
    )
  );

-- Module Progress
CREATE POLICY "lms: adv baca progress sendiri"
  ON lms_module_progress FOR SELECT TO authenticated
  USING (
    enrollment_id IN (
      SELECT id FROM lms_program_enrollments WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "lms: manager & admin baca semua progress"
  ON lms_module_progress FOR SELECT TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'));

-- System update progress (via service role di server actions)
CREATE POLICY "lms: service role manage progress"
  ON lms_module_progress FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- FUNCTION: Init module progress saat enrollment diapprove
-- ============================================================
CREATE OR REPLACE FUNCTION lms_init_module_progress(p_enrollment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_program_id uuid;
  v_first_module_id uuid;
BEGIN
  -- Ambil program dari enrollment
  SELECT program_id INTO v_program_id
  FROM lms_program_enrollments WHERE id = p_enrollment_id;

  -- Insert semua modul dengan status locked
  INSERT INTO lms_module_progress (enrollment_id, module_id, status)
  SELECT
    p_enrollment_id,
    m.id,
    'locked'
  FROM lms_program_phases ph
  JOIN lms_program_modules m ON m.phase_id = ph.id
  WHERE ph.program_id = v_program_id
  ON CONFLICT (enrollment_id, module_id) DO NOTHING;

  -- Set modul pertama jadi in_progress
  SELECT m.id INTO v_first_module_id
  FROM lms_program_phases ph
  JOIN lms_program_modules m ON m.phase_id = ph.id
  WHERE ph.program_id = v_program_id
  ORDER BY ph.order_index ASC, m.order_index ASC
  LIMIT 1;

  IF v_first_module_id IS NOT NULL THEN
    UPDATE lms_module_progress
    SET status = 'in_progress', started_at = now()
    WHERE enrollment_id = p_enrollment_id
      AND module_id = v_first_module_id;
  END IF;
END $$;
