-- =====================================================================
-- Bikin 3 akun test + assign role
-- =====================================================================
-- 1. staffmeta@gmail.com  → Staff di Advertiser Meta
-- 2. spvcrm@gmail.com     → SPV di CRM
-- 3. headcs@gmail.com     → Head di Customer Service
--
-- Password semua: qwerty
-- =====================================================================

create extension if not exists pgcrypto;

do $$
declare
  v_users jsonb := '[
    {"email": "staffmeta@gmail.com", "name": "Staff Advertiser Meta", "division": "advertiser_meta", "role": "staff"},
    {"email": "spvcrm@gmail.com",    "name": "SPV CRM",               "division": "crm",             "role": "spv"},
    {"email": "headcs@gmail.com",    "name": "Head Customer Service", "division": "cs",              "role": "head"}
  ]'::jsonb;
  v_user jsonb;
  v_user_id uuid;
  v_email text;
  v_name text;
  v_div text;
  v_role text;
  v_existing uuid;
begin
  for v_user in select * from jsonb_array_elements(v_users)
  loop
    v_email := v_user->>'email';
    v_name  := v_user->>'name';
    v_div   := v_user->>'division';
    v_role  := v_user->>'role';

    -- Cek kalau user sudah ada
    select id into v_existing from auth.users where email = v_email;

    if v_existing is not null then
      -- Update password saja
      update auth.users
      set
        encrypted_password = crypt('qwerty', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now(),
        raw_user_meta_data = jsonb_set(
          coalesce(raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb(v_name)
        )
      where id = v_existing;
      v_user_id := v_existing;
      raise notice 'User % sudah ada, password & nama di-update.', v_email;
    else
      -- Bikin user baru
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_email,
        crypt('qwerty', gen_salt('bf')),
        now(),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_name),
        false,
        '', '', '', ''
      );

      -- Insert ke auth.identities (wajib untuk password login di Supabase versi baru)
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(),
        v_user_id,
        v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
        'email',
        now(),
        now(),
        now()
      );

      raise notice 'User % berhasil dibuat.', v_email;
    end if;

    -- Pastikan user_profiles ada (trigger handle_new_user mungkin sudah jalan,
    -- tapi kalau bukan baru kita upsert manual)
    insert into public.user_profiles (id, email, full_name, is_active)
    values (v_user_id, v_email, v_name, true)
    on conflict (id) do update
      set email = excluded.email,
          full_name = excluded.full_name,
          is_active = true;

    -- Assign divisi & role
    insert into public.user_divisions (user_id, division_code, role)
    values (v_user_id, v_div, v_role)
    on conflict (user_id, division_code) do update set role = excluded.role;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- VERIFIKASI: lihat ketiga user + role-nya
-- ---------------------------------------------------------------------
select
  up.email,
  up.full_name,
  ud.division_code,
  d.name as division_name,
  ud.role,
  case when au.encrypted_password is not null then 'OK' else 'TIDAK ADA' end as password,
  case when au.email_confirmed_at is not null then 'OK' else 'BELUM' end as email_confirmed
from public.user_profiles up
join auth.users au on au.id = up.id
left join public.user_divisions ud on ud.user_id = up.id
left join public.divisions d on d.code = ud.division_code
where up.email in ('staffmeta@gmail.com', 'spvcrm@gmail.com', 'headcs@gmail.com')
order by up.email;
