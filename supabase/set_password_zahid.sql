-- =====================================================================
-- Set password 'qwerty' untuk zahidfauzir7885@gmail.com
-- =====================================================================
-- Bypass rate limit email — bisa langsung login password setelah ini.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Cek user-nya ada
-- ---------------------------------------------------------------------
select
  '== SEBELUM ==' as state,
  id,
  email,
  email_confirmed_at,
  last_sign_in_at,
  case
    when encrypted_password is null then 'BELUM ada password'
    else 'SUDAH ada password'
  end as password_status
from auth.users
where email = 'zahidfauzir7885@gmail.com';

-- ---------------------------------------------------------------------
-- 2. Update password + confirm email
-- ---------------------------------------------------------------------
update auth.users
set
  encrypted_password = crypt('qwerty', gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where email = 'zahidfauzir7885@gmail.com';

-- ---------------------------------------------------------------------
-- 3. Verifikasi password match (harus return true)
-- ---------------------------------------------------------------------
select
  '== TEST PASSWORD ==' as state,
  email,
  (encrypted_password = crypt('qwerty', encrypted_password)) as password_qwerty_match
from auth.users
where email = 'zahidfauzir7885@gmail.com';

-- ---------------------------------------------------------------------
-- 4. Cek hasil akhir
-- ---------------------------------------------------------------------
select
  '== SESUDAH ==' as state,
  email,
  email_confirmed_at,
  updated_at,
  'qwerty' as password_now
from auth.users
where email = 'zahidfauzir7885@gmail.com';
