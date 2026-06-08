-- =====================================================================
-- Set password manual untuk user (bypass rate limit email)
-- =====================================================================
-- Berguna saat development atau saat rate limit email kena.
-- Pakai pgcrypto bcrypt — sama format yang Supabase Auth pakai.
--
-- GANTI dua nilai di bawah:
--   - 'admin@redigma.com'  → email user Anda
--   - 'redigma123'         → password baru
-- =====================================================================

-- Pastikan extension pgcrypto aktif (biasanya sudah default di Supabase)
create extension if not exists pgcrypto;

-- Update password user
update auth.users
set
  encrypted_password = crypt('redigma123', gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where email = 'admin@redigma.com';

-- Verifikasi
select email, email_confirmed_at, last_sign_in_at
from auth.users
where email = 'admin@redigma.com';
