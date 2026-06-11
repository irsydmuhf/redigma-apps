-- ============================================================
-- GABUNGAN MIGRASI LMS YANG BELUM DITERAPKAN: 0040 – 0043
-- Paste seluruh isi file ini ke Supabase SQL Editor lalu Run.
-- Idempotent & aman dijalankan ulang.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════
-- ║ 0040_lms_phase7.sql
-- ╚══════════════════════════════════════════════════════════
-- ============================================================
-- Phase 7: Notifikasi in-app
-- ============================================================

CREATE TABLE IF NOT EXISTS lms_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL,        -- enrollment | submission | milestone | posttest | at_risk
  title      text NOT NULL,
  body       text,
  link       text,                 -- path in-app tujuan saat notif diklik
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lms_notifications_user_idx
  ON lms_notifications (user_id, is_read, created_at DESC);

ALTER TABLE lms_notifications ENABLE ROW LEVEL SECURITY;

-- User hanya bisa lihat & menandai-baca notifikasinya sendiri.
DROP POLICY IF EXISTS notif_select ON lms_notifications;
CREATE POLICY notif_select ON lms_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notif_update ON lms_notifications;
CREATE POLICY notif_update ON lms_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Insert dilakukan lewat service role (server action), jadi tak perlu policy insert.

-- ╔══════════════════════════════════════════════════════════
-- ║ 0041_lms_phase7_cron.sql
-- ╚══════════════════════════════════════════════════════════
-- ============================================================
-- Phase 7: Alert harian ADV tertinggal (in-app via pg_cron)
-- ============================================================
-- Notifikasi in-app ke ADV & Manager untuk modul in_progress yang
-- sudah melewati estimasi (estimated_days) sejak dibuka.
-- Email (Resend) ditangani terpisah via Edge Function.

CREATE OR REPLACE FUNCTION lms_notify_at_risk()
RETURNS void AS $fn$
BEGIN
  -- Notif ke ADV yang tertinggal (dedup: tidak insert kalau sudah ada
  -- notif at_risk untuk modul yang sama dalam 20 jam terakhir).
  INSERT INTO lms_notifications (user_id, type, title, body, link)
  SELECT
    e.user_id,
    'at_risk',
    'Kamu tertinggal dari jadwal',
    'Modul "' || m.title || '" sudah melewati estimasi ' ||
      COALESCE(m.estimated_days, 1) || ' hari. Yuk lanjutkan belajarmu.',
    '/lms/module/' || m.id
  FROM lms_module_progress mp
  JOIN lms_program_enrollments e ON e.id = mp.enrollment_id AND e.status = 'active'
  JOIN lms_program_modules m ON m.id = mp.module_id
  WHERE mp.status = 'in_progress'
    AND mp.started_at IS NOT NULL
    AND mp.started_at < now() - ((COALESCE(m.estimated_days, 1)) || ' days')::interval
    AND NOT EXISTS (
      SELECT 1 FROM lms_notifications n
      WHERE n.user_id = e.user_id
        AND n.type = 'at_risk'
        AND n.link = '/lms/module/' || m.id
        AND n.created_at > now() - interval '20 hours'
    );

  -- Notif ke Manager pemilik program.
  INSERT INTO lms_notifications (user_id, type, title, body, link)
  SELECT
    p.created_by,
    'at_risk',
    'ADV tertinggal dari jadwal',
    prof.full_name || ' tertinggal di modul "' || m.title ||
      '" pada program ' || p.name || '.',
    '/lms/manager/adv/' || e.id
  FROM lms_module_progress mp
  JOIN lms_program_enrollments e ON e.id = mp.enrollment_id AND e.status = 'active'
  JOIN lms_program_modules m ON m.id = mp.module_id
  JOIN lms_programs p ON p.id = e.program_id
  JOIN lms_user_profiles prof ON prof.id = e.user_id
  WHERE mp.status = 'in_progress'
    AND mp.started_at IS NOT NULL
    AND mp.started_at < now() - ((COALESCE(m.estimated_days, 1)) || ' days')::interval
    AND p.created_by IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM lms_notifications n
      WHERE n.user_id = p.created_by
        AND n.type = 'at_risk'
        AND n.link = '/lms/manager/adv/' || e.id
        AND n.created_at > now() - interval '20 hours'
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Jadwalkan via pg_cron (kalau extension tersedia) ─────────
-- 08:00 WIB = 01:00 UTC → '0 1 * * *'. Supabase pakai UTC.
-- Free tier tanpa pg_cron: panggil manual `select lms_notify_at_risk();`
-- atau lewat external cron (Vercel Cron / GitHub Actions) yang invoke RPC.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions
    WHERE name = 'pg_cron' AND installed_version IS NOT NULL
  ) THEN
    PERFORM cron.unschedule('lms-notify-at-risk')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lms-notify-at-risk');
    PERFORM cron.schedule(
      'lms-notify-at-risk',
      '0 1 * * *',  -- 08:00 WIB
      $sql$ SELECT lms_notify_at_risk() $sql$
    );
    RAISE NOTICE 'pg_cron job "lms-notify-at-risk" terjadwal (08:00 WIB).';
  ELSE
    RAISE NOTICE 'pg_cron belum aktif. Panggil manual: select lms_notify_at_risk();';
  END IF;
END $do$;

-- ╔══════════════════════════════════════════════════════════
-- ║ 0042_lms_phase8_user_active.sql
-- ╚══════════════════════════════════════════════════════════
-- ============================================================
-- Phase 8: Status aktif/nonaktif user LMS
-- ============================================================
-- User nonaktif tidak bisa mengakses LMS (dicek di getCurrentLmsUser).

ALTER TABLE lms_user_profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ╔══════════════════════════════════════════════════════════
-- ║ 0043_lms_reconcile_progress.sql
-- ╚══════════════════════════════════════════════════════════
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
