-- =====================================================================
-- Fix akun zahidfauzir7885@gmail.com — assign admin + staff/spv/head
-- =====================================================================
-- 1. Diagnostic: lihat role yang saat ini ter-assign
-- 2. Hapus assignment lama untuk user ini (kecuali admin di data_it)
-- 3. Assign multi-divisi dengan campuran role: admin + staff/spv/head
-- 4. Verifikasi hasil
--
-- GANTI nilai 'zahidfauzir7885@gmail.com' kalau email berbeda.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DIAGNOSTIC: cek role saat ini
-- ---------------------------------------------------------------------
select
  '== SEBELUM ==' as state,
  up.email,
  ud.division_code,
  d.name as division_name,
  ud.role
from public.user_profiles up
left join public.user_divisions ud on ud.user_id = up.id
left join public.divisions d on d.code = ud.division_code
where up.email = 'zahidfauzir7885@gmail.com'
order by ud.division_code;

-- ---------------------------------------------------------------------
-- ASSIGN: admin di data_it + role variasi di divisi lain
-- ---------------------------------------------------------------------
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from public.user_profiles
  where email = 'zahidfauzir7885@gmail.com';

  if v_user_id is null then
    raise exception 'User zahidfauzir7885@gmail.com tidak ditemukan di user_profiles. Cek tabel auth.users dan pastikan trigger handle_new_user sudah jalan.';
  end if;

  -- Pastikan admin di Data IT (full access)
  insert into public.user_divisions (user_id, division_code, role)
  values (v_user_id, 'data_it', 'admin')
  on conflict (user_id, division_code) do update set role = 'admin';

  -- Tambah role staff/spv/head di beberapa divisi utama
  insert into public.user_divisions (user_id, division_code, role) values
    (v_user_id, 'cs',                'head'),
    (v_user_id, 'crm',               'spv'),
    (v_user_id, 'advertiser_meta',   'spv'),
    (v_user_id, 'advertiser_shopee', 'staff'),
    (v_user_id, 'advertiser_tiktok', 'staff'),
    (v_user_id, 'finance',           'head'),
    (v_user_id, 'hr',                'spv'),
    (v_user_id, 'content_meta',      'staff'),
    (v_user_id, 'content_tiktok',    'staff'),
    (v_user_id, 'live',              'staff'),
    (v_user_id, 'brand_associate',   'head')
  on conflict (user_id, division_code) do update set role = excluded.role;

  raise notice 'OK: user % di-assign ke 12 divisi (1 admin + 11 staff/spv/head).', v_user_id;
end $$;

-- ---------------------------------------------------------------------
-- VERIFIKASI: cek hasil
-- ---------------------------------------------------------------------
select
  '== SESUDAH ==' as state,
  up.email,
  ud.division_code,
  d.name as division_name,
  ud.role
from public.user_profiles up
join public.user_divisions ud on ud.user_id = up.id
join public.divisions d on d.code = ud.division_code
where up.email = 'zahidfauzir7885@gmail.com'
order by
  case ud.role
    when 'admin' then 1
    when 'head' then 2
    when 'spv' then 3
    when 'staff' then 4
    when 'direksi' then 5
  end,
  d.name;
