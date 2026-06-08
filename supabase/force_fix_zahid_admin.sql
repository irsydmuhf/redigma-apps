-- =====================================================================
-- FORCE FIX: assign admin + role lengkap ke zahidfauzir7885@gmail.com
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DIAGNOSTIC: cek state awal (per tabel)
-- ---------------------------------------------------------------------
select 'auth.users' as source, id::text, email, email_confirmed_at::text
from auth.users
where email = 'zahidfauzir7885@gmail.com';

select 'user_profiles' as source, id::text, email, is_active::text
from public.user_profiles
where email = 'zahidfauzir7885@gmail.com';

select 'user_divisions' as source,
       ud.user_id::text,
       ud.division_code,
       ud.role
from public.user_divisions ud
join auth.users u on u.id = ud.user_id
where u.email = 'zahidfauzir7885@gmail.com';

-- ---------------------------------------------------------------------
-- 2. FORCE FIX
-- ---------------------------------------------------------------------
do $$
declare
  v_user_id uuid;
  v_email text := 'zahidfauzir7885@gmail.com';
begin
  -- Pastikan user ada di auth.users
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    raise exception 'User % tidak ada di auth.users. Daftarkan dulu di Supabase Dashboard > Authentication > Users > Add user.', v_email;
  end if;

  raise notice 'Found user_id: %', v_user_id;

  -- Force create user_profiles (kalau belum ada)
  insert into public.user_profiles (id, email, full_name, is_active)
  values (v_user_id, v_email, 'Zahid Fauzir (Owner)', true)
  on conflict (id) do update
    set email = excluded.email,
        is_active = true;

  raise notice 'user_profiles row ensured';

  -- Hapus assignment lama (clean slate)
  delete from public.user_divisions where user_id = v_user_id;

  -- Assign admin + multiple roles
  insert into public.user_divisions (user_id, division_code, role) values
    (v_user_id, 'data_it',           'admin'),
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
    (v_user_id, 'brand_associate',   'head');

  raise notice 'OK: 12 divisi ter-assign (1 admin + 11 staff/spv/head)';
end $$;

-- ---------------------------------------------------------------------
-- 3. VERIFIKASI
-- ---------------------------------------------------------------------
select
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
  end,
  d.name;

-- Test helper functions (harus is_admin = true)
select
  up.email,
  public.is_admin(up.id) as is_admin,
  public.is_direksi(up.id) as is_direksi
from public.user_profiles up
where up.email = 'zahidfauzir7885@gmail.com';
