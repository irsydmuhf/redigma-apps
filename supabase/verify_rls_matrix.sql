-- =====================================================================
-- Phase 9: RLS Verification Matrix
-- =====================================================================
-- Verifikasi RLS policies bekerja sesuai role.
-- Jalankan di Supabase SQL Editor — pakai role `postgres` untuk lihat semua.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cek semua tabel yang RLS-nya aktif
-- ---------------------------------------------------------------------
select
  schemaname,
  tablename,
  case when rowsecurity then '✓ enabled' else '✗ DISABLED' end as rls
from pg_tables
where schemaname = 'public'
  and tablename in (
    'divisions', 'user_profiles', 'user_divisions',
    'datasets', 'dataset_columns', 'import_jobs',
    'schema_changelog', 'audit_log'
  )
order by tablename;

-- ---------------------------------------------------------------------
-- 2. List semua policies di tabel utama
-- ---------------------------------------------------------------------
select
  tablename,
  policyname,
  cmd as operation,
  roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ---------------------------------------------------------------------
-- 3. Cek dynamic tables — pastikan punya 4 policies (select/insert/update/delete)
-- ---------------------------------------------------------------------
select
  d.physical_table_name,
  d.display_name,
  count(p.policyname) as policy_count,
  array_agg(p.cmd order by p.cmd) as policies
from public.datasets d
left join pg_policies p
  on p.schemaname = 'public'
  and p.tablename = d.physical_table_name
group by d.physical_table_name, d.display_name
order by d.physical_table_name;

-- ---------------------------------------------------------------------
-- 4. Cek Direksi assignment
-- ---------------------------------------------------------------------
select
  up.email,
  ud.role,
  count(distinct ud.division_code) as division_count
from public.user_profiles up
join public.user_divisions ud on ud.user_id = up.id
where ud.role = 'direksi'
group by up.email, ud.role;

-- ---------------------------------------------------------------------
-- 5. Simulasi: data apa yang dilihat user X di tabel dinamis Y
-- ---------------------------------------------------------------------
-- GANTI 'email-target@redigma.com' dengan email yang mau di-test.
-- Query ini meniru auth.uid() dari user tersebut.
--
-- Cara pakai:
-- 1. Pilih email user target
-- 2. Pilih nama tabel dinamis target
-- 3. Run — hasilnya = data yang user itu lihat (sesuai RLS-nya)
--
-- Note: query ini perlu di-set role dulu via:
--   set role authenticated;
--   set request.jwt.claims = '{"sub": "<user_id>", "role": "authenticated"}';
--
-- Untuk simplicity, kita pakai pendekatan deklaratif: cek apakah user
-- TERMASUK dalam scope policy.

select
  up.email,
  d.physical_table_name as dataset,
  case
    when public.is_admin(up.id)    then 'admin (full akses)'
    when public.is_direksi(up.id)  then 'direksi (read-only)'
    when exists (
      select 1 from public.user_divisions
      where user_id = up.id
        and division_code = d.division_code
        and role in ('staff', 'spv', 'head')
    ) then 'member divisi (read + write)'
    else 'TIDAK PUNYA AKSES'
  end as access_level
from public.user_profiles up
cross join public.datasets d
order by up.email, d.physical_table_name;
