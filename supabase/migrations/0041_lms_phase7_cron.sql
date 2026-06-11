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
