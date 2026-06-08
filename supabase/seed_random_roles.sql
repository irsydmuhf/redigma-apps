-- =====================================================================
-- Seed role random untuk testing (staff/spv/head di divisi acak)
-- =====================================================================
-- Untuk setiap user yang terdaftar di auth.users:
--   - Assign 2-3 divisi random
--   - Role random dari {staff, spv, head}
--   - Tidak menimpa assignment yang sudah ada (ON CONFLICT DO NOTHING)
--   - Tidak menyentuh role admin existing
--
-- Jalankan di Supabase SQL Editor > Run
-- =====================================================================

do $$
declare
  v_user record;
  v_divisions text[] := array[
    'cs', 'crm', 'crm_b2b',
    'advertiser_meta', 'advertiser_shopee', 'advertiser_tiktok',
    'live', 'brand_associate',
    'content_meta', 'content_tiktok', 'content_corporate',
    'finance', 'hr'
  ];
  v_roles text[] := array['staff', 'spv', 'head'];
  v_division text;
  v_role text;
  v_num int;
  v_i int;
begin
  for v_user in
    select u.id, u.email
    from auth.users u
    where exists (select 1 from public.user_profiles where id = u.id)
  loop
    -- 2-3 divisi random per user
    v_num := 2 + floor(random() * 2)::int;

    for v_i in 1..v_num loop
      v_division := v_divisions[1 + floor(random() * array_length(v_divisions, 1))::int];
      v_role := v_roles[1 + floor(random() * array_length(v_roles, 1))::int];

      insert into public.user_divisions (user_id, division_code, role)
      values (v_user.id, v_division, v_role)
      on conflict (user_id, division_code) do nothing;
    end loop;
  end loop;
end $$;

-- Verifikasi hasil
select
  up.email,
  ud.division_code,
  d.name as division_name,
  ud.role
from public.user_profiles up
join public.user_divisions ud on ud.user_id = up.id
join public.divisions d on d.code = ud.division_code
order by up.email, ud.division_code;
