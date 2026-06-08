-- =====================================================================
-- Phase 2: User model, divisi, RBAC dasar
-- =====================================================================
-- Tabel: divisions, user_profiles, user_divisions
-- Function: is_admin(uuid), is_direksi(uuid)
-- Trigger: handle_new_user (auto-create user_profile saat auth.users insert)
-- RLS: dasar (akan diperkuat di Phase 9)
-- Seed: master divisi Redigma
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL: divisions
-- ---------------------------------------------------------------------
create table if not exists public.divisions (
  code text primary key,
  name text not null,
  parent_code text references public.divisions(code) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.divisions is
  'Master divisi Redigma. Code dipakai sebagai identifier teknis, name untuk UI.';

-- ---------------------------------------------------------------------
-- 2. TABEL: user_profiles
-- ---------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_profiles is
  'Profil user — extends auth.users. Otomatis dibuat oleh trigger handle_new_user.';

-- ---------------------------------------------------------------------
-- 3. TABEL: user_divisions (many-to-many user × divisi × role)
-- ---------------------------------------------------------------------
create table if not exists public.user_divisions (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  division_code text not null references public.divisions(code) on delete cascade,
  role text not null check (role in ('staff', 'spv', 'head', 'direksi', 'admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, division_code)
);

comment on table public.user_divisions is
  'Penugasan user ke divisi dengan role. Satu user bisa di banyak divisi.';

create index if not exists idx_user_divisions_user
  on public.user_divisions(user_id);

create index if not exists idx_user_divisions_division
  on public.user_divisions(division_code);

-- ---------------------------------------------------------------------
-- 4. HELPER FUNCTIONS
-- ---------------------------------------------------------------------

-- is_admin: true kalau user punya role 'admin' di divisi mana pun.
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_divisions
    where user_id = p_user_id and role = 'admin'
  );
$$;

-- is_direksi: true kalau user punya role 'direksi' di divisi mana pun.
create or replace function public.is_direksi(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_divisions
    where user_id = p_user_id and role = 'direksi'
  );
$$;

-- get_user_divisions: list divisi yang user-nya punya akses.
create or replace function public.get_user_divisions(p_user_id uuid)
returns table(division_code text, role text)
language sql
security definer
stable
set search_path = public
as $$
  select division_code, role
  from public.user_divisions
  where user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------
-- 5. TRIGGER: handle_new_user (auto-create profile)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. RLS POLICIES
-- ---------------------------------------------------------------------
alter table public.divisions enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_divisions enable row level security;

-- divisions: semua user authenticated bisa baca master divisi
drop policy if exists "divisions readable by authenticated"
  on public.divisions;
create policy "divisions readable by authenticated"
  on public.divisions for select
  to authenticated
  using (true);

drop policy if exists "divisions writable by admin"
  on public.divisions;
create policy "divisions writable by admin"
  on public.divisions for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- user_profiles: user baca profilnya sendiri, admin baca/tulis semua
drop policy if exists "profiles select own or admin"
  on public.user_profiles;
create policy "profiles select own or admin"
  on public.user_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles update own or admin"
  on public.user_profiles;
create policy "profiles update own or admin"
  on public.user_profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles insert admin"
  on public.user_profiles;
create policy "profiles insert admin"
  on public.user_profiles for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

-- user_divisions: user baca milik sendiri, admin baca/tulis semua
drop policy if exists "user_divisions select own or admin"
  on public.user_divisions;
create policy "user_divisions select own or admin"
  on public.user_divisions for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "user_divisions write admin"
  on public.user_divisions;
create policy "user_divisions write admin"
  on public.user_divisions for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 7. SEED: master divisi Redigma
-- ---------------------------------------------------------------------
insert into public.divisions (code, name, parent_code, position) values
  ('data_it',           'Data IT',                   null,        1),
  ('marketing',         'Marketing',                 null,       10),
  ('brand_associate',   'Brand Associate',           'marketing', 11),
  ('advertiser_meta',   'Advertiser Meta',           'marketing', 12),
  ('advertiser_shopee', 'Advertiser Shopee',         'marketing', 13),
  ('advertiser_tiktok', 'Advertiser TikTok',         'marketing', 14),
  ('cs',                'Customer Service',          null,       20),
  ('crm',               'CRM',                       null,       21),
  ('crm_b2b',           'CRM Organik Apotek B2B',    'crm',      22),
  ('live',              'Staff Live',                null,       30),
  ('content_meta',      'Content Creator Meta',      null,       40),
  ('content_tiktok',    'Content Creator TikTok',    null,       41),
  ('content_corporate', 'Content Creator Corporate', null,       42),
  ('finance',           'Finance & Accounting',      null,       50),
  ('hr',                'Human Capital',             null,       60)
on conflict (code) do update
  set name = excluded.name,
      parent_code = excluded.parent_code,
      position = excluded.position;
