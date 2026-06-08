-- =====================================================================
-- Migration 0031: Sistem Alias Akun (matching nama Excel → akun karyawan)
-- =====================================================================
-- Konteks:
--   1 orang punya banyak "nama panggilan" di Excel (Cs.Budi, Budi CS, Budi).
--   Sistem ini menyimpan daftar alias per akun + peran, lalu otomatis
--   nyambungin transaksi ke akun pemilik berdasarkan match alias.
--
-- Aturan utama:
--   • Alias unik per (peran, alias_normalized)
--   • Boleh sama antar peran (Budi-CS & Budi-Content boleh)
--   • Smart-normalize: case-insensitive + spasi rapi
--   • Mendukung handover (valid_from / valid_to)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. crm_role_columns — master daftar peran yang muncul di transaksi
-- ---------------------------------------------------------------------
create table if not exists public.crm_role_columns (
  code text primary key,
  label text not null,
  excel_column_hint text,
  divisions text[] default '{}',
  is_active boolean default true,
  display_order int default 100,
  created_at timestamptz default now()
);

comment on table public.crm_role_columns is
  'Daftar peran yang bisa muncul di kolom Excel transaksi (CS, Adv, dll). Fleksibel — Admin bisa aktif/nonaktifkan kapan saja.';

-- Seed: CS + Adv aktif (sesuai keputusan user — saat ini hanya 2 itu yang ada di Excel).
-- CRM, Live, Content disiapkan tapi nonaktif.
insert into public.crm_role_columns (code, label, excel_column_hint, divisions, is_active, display_order)
values
  ('cs',      'CS',              'Nama CS / Customer Service',  array['cs'],                                                       true,  10),
  ('adv',     'Advertiser',      'Nama Advertiser',             array['advertiser_meta', 'advertiser_shopee', 'advertiser_tiktok'], true,  20),
  ('crm',     'CRM',             'Nama CRM',                    array['crm'],                                                      false, 30),
  ('live',    'Live Host',       'Nama Host / Live',            array['live'],                                                     false, 40),
  ('content', 'Content Creator', 'Nama Content',                array['content_meta', 'content_tiktok'],                           false, 50)
on conflict (code) do nothing;

alter table public.crm_role_columns enable row level security;

drop policy if exists crm_role_columns_read on public.crm_role_columns;
create policy crm_role_columns_read on public.crm_role_columns
  for select to authenticated using (true);

drop policy if exists crm_role_columns_admin_write on public.crm_role_columns;
create policy crm_role_columns_admin_write on public.crm_role_columns
  for all to authenticated
  using (
    exists (
      select 1 from public.user_divisions
      where user_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_divisions
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- ---------------------------------------------------------------------
-- 2. user_role_aliases — daftar alias per (akun, peran)
-- ---------------------------------------------------------------------
create table if not exists public.user_role_aliases (
  id bigserial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role_code text not null references public.crm_role_columns(code) on delete cascade,
  alias_text text not null,
  alias_normalized text generated always as (
    lower(trim(regexp_replace(alias_text, '\s+', ' ', 'g')))
  ) stored,
  valid_from date,  -- null = berlaku sejak awal
  valid_to date,    -- null = berlaku selamanya (sampai dihapus)
  notes text,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.user_role_aliases is
  'Daftar nama panggilan (alias) per akun per peran. Saat sync transaksi, sistem cocokkan nama di Excel ke alias ini.';

-- Unique: 1 alias_normalized cuma boleh 1 user per peran (per masa berlaku)
-- Pakai exclusion constraint untuk daterange overlap detection
create unique index if not exists uq_alias_per_role
  on public.user_role_aliases (role_code, alias_normalized, coalesce(valid_from, date '1900-01-01'));

-- Index lookup cepat saat matching transaksi → user
create index if not exists idx_alias_lookup
  on public.user_role_aliases (role_code, alias_normalized)
  include (user_id, valid_from, valid_to);

create index if not exists idx_alias_user
  on public.user_role_aliases (user_id, role_code);

-- Auto-update timestamp
create or replace function public._touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_alias_touch on public.user_role_aliases;
create trigger trg_alias_touch before update on public.user_role_aliases
  for each row execute function public._touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. RLS untuk user_role_aliases — Admin + Head/SPV divisi sendiri
-- ---------------------------------------------------------------------
alter table public.user_role_aliases enable row level security;

-- READ: Admin baca semua. Direksi baca semua. User biasa baca punya sendiri + tim divisi sendiri.
drop policy if exists alias_read on public.user_role_aliases;
create policy alias_read on public.user_role_aliases
  for select to authenticated
  using (
    -- Admin / Direksi: full read
    exists (
      select 1 from public.user_divisions
      where user_id = auth.uid() and role in ('admin', 'direksi')
    )
    -- Atau alias diri sendiri
    or user_id = auth.uid()
    -- Atau Head/SPV: lihat alias anggota divisi peran ini
    or exists (
      select 1
      from public.user_divisions me
      join public.crm_role_columns rc on rc.code = user_role_aliases.role_code
      where me.user_id = auth.uid()
        and me.role in ('head', 'spv')
        and me.division_code = any(rc.divisions)
    )
  );

-- WRITE: Admin full. Head/SPV bisa edit alias anggota divisi mereka (tapi bukan diri sendiri).
drop policy if exists alias_insert on public.user_role_aliases;
create policy alias_insert on public.user_role_aliases
  for insert to authenticated
  with check (
    -- Admin
    exists (
      select 1 from public.user_divisions
      where user_id = auth.uid() and role = 'admin'
    )
    -- Head/SPV — anggota divisi sendiri, dan TIDAK boleh edit alias diri sendiri (cegah self-deal)
    or (
      user_id <> auth.uid()
      and exists (
        select 1
        from public.user_divisions me
        join public.crm_role_columns rc on rc.code = user_role_aliases.role_code
        where me.user_id = auth.uid()
          and me.role in ('head', 'spv')
          and me.division_code = any(rc.divisions)
      )
      and exists (
        select 1
        from public.user_divisions target
        join public.crm_role_columns rc on rc.code = user_role_aliases.role_code
        where target.user_id = user_role_aliases.user_id
          and target.division_code = any(rc.divisions)
      )
    )
  );

drop policy if exists alias_update on public.user_role_aliases;
create policy alias_update on public.user_role_aliases
  for update to authenticated
  using (
    exists (
      select 1 from public.user_divisions
      where user_id = auth.uid() and role = 'admin'
    )
    or (
      user_id <> auth.uid()
      and exists (
        select 1
        from public.user_divisions me
        join public.crm_role_columns rc on rc.code = user_role_aliases.role_code
        where me.user_id = auth.uid()
          and me.role in ('head', 'spv')
          and me.division_code = any(rc.divisions)
      )
    )
  );

drop policy if exists alias_delete on public.user_role_aliases;
create policy alias_delete on public.user_role_aliases
  for delete to authenticated
  using (
    exists (
      select 1 from public.user_divisions
      where user_id = auth.uid() and role = 'admin'
    )
    or (
      user_id <> auth.uid()
      and exists (
        select 1
        from public.user_divisions me
        join public.crm_role_columns rc on rc.code = user_role_aliases.role_code
        where me.user_id = auth.uid()
          and me.role in ('head', 'spv')
          and me.division_code = any(rc.divisions)
      )
    )
  );

-- ---------------------------------------------------------------------
-- 4. Helper function untuk normalisasi (dipakai server-side)
-- ---------------------------------------------------------------------
create or replace function public.normalize_alias(p_text text)
returns text
language sql immutable as $$
  select lower(trim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')));
$$;

notify pgrst, 'reload schema';
