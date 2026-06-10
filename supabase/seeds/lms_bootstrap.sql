-- ============================================================
-- LMS Bootstrap Seed
-- Jalankan SETELAH migration 0034_lms_phase1.sql sudah diapply.
--
-- LANGKAH:
-- 1. Ganti YOUR_AUTH_USER_ID dengan UUID dari Supabase Dashboard
--    → Authentication → Users → klik user → salin User UID
-- 2. Ganti data nama/email sesuai akun Anda
-- 3. Jalankan di SQL Editor Supabase
-- ============================================================

-- Ganti nilai ini:
DO $$
DECLARE
  v_user_id  uuid := 'YOUR_AUTH_USER_ID';   -- ← ganti ini
  v_name     text := 'Admin LMS';            -- ← ganti nama
  v_email    text := 'akun.redigma@gmail.com'; -- ← ganti email
  v_prog_id  uuid;
BEGIN

  -- 1. Insert admin profile (skip jika sudah ada)
  INSERT INTO lms_user_profiles (id, full_name, email, role)
  VALUES (v_user_id, v_name, v_email, 'admin')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Buat satu program contoh
  INSERT INTO lms_programs (id, name, description, platform, created_by)
  VALUES (
    gen_random_uuid(),
    'Onboarding ADV Batch 1',
    'Program onboarding untuk ADV baru — mencakup product knowledge, SOP lapangan, dan tools internal.',
    'other',
    v_user_id
  )
  RETURNING id INTO v_prog_id;

  RAISE NOTICE 'Bootstrap selesai. Program ID: %', v_prog_id;
END $$;
