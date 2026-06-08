-- =====================================================================
-- Bootstrap admin pertama (Data IT)
-- =====================================================================
-- Jalankan SETELAH:
--   1. Migration 0001 sudah di-apply
--   2. Anda sudah register email Anda via Supabase Dashboard
--      > Authentication > Users > Add user
--      (atau via halaman /login sekali — magic link akan create auth.users)
--
-- Ganti 'admin@redigma.com' dengan email Anda.
-- =====================================================================

insert into public.user_divisions (user_id, division_code, role)
select id, 'data_it', 'admin'
from auth.users
where email = 'admin@redigma.com'
on conflict (user_id, division_code) do update set role = 'admin';

-- Verifikasi:
select up.email, ud.division_code, ud.role
from public.user_profiles up
join public.user_divisions ud on ud.user_id = up.id
where up.email = 'admin@redigma.com';
