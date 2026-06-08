-- =====================================================================
-- Phase 3: Datasets, dynamic tables, RPC create_dynamic_table
-- =====================================================================
-- Tabel: datasets, dataset_columns
-- Function: create_dynamic_table(physical_name, columns, division, user, display_name)
--   - Validasi identifier dengan regex (mencegah SQL injection)
--   - format('%I', ...) untuk safe identifier escaping
--   - Auto-inject kolom system + RLS basic per tabel dinamis
-- RLS: datasets/dataset_columns dapat dibaca user di divisi sama atau admin/direksi
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL: datasets (metadata tabel dinamis)
-- ---------------------------------------------------------------------
create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  physical_table_name text not null unique,
  display_name text not null,
  description text,
  division_code text not null references public.divisions(code) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.datasets is
  'Metadata setiap dataset (tabel dinamis hasil upload CSV).';

create index if not exists idx_datasets_division on public.datasets(division_code);

-- ---------------------------------------------------------------------
-- 2. TABEL: dataset_columns
-- ---------------------------------------------------------------------
create table if not exists public.dataset_columns (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  physical_column_name text not null,
  display_name text not null,
  data_type text not null check (
    data_type in ('text', 'number', 'date', 'boolean', 'currency', 'phone', 'email')
  ),
  is_required boolean not null default false,
  is_unique_key boolean not null default false,
  position int not null,
  unique (dataset_id, physical_column_name)
);

create index if not exists idx_dataset_columns_dataset
  on public.dataset_columns(dataset_id);

-- ---------------------------------------------------------------------
-- 3. RLS: datasets & dataset_columns
-- ---------------------------------------------------------------------
alter table public.datasets enable row level security;
alter table public.dataset_columns enable row level security;

drop policy if exists "datasets_select_by_division" on public.datasets;
create policy "datasets_select_by_division"
  on public.datasets for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_direksi(auth.uid())
    or division_code in (
      select division_code from public.user_divisions where user_id = auth.uid()
    )
  );

drop policy if exists "datasets_write_admin_or_member" on public.datasets;
create policy "datasets_write_admin_or_member"
  on public.datasets for all
  to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.user_divisions
      where user_id = auth.uid()
        and division_code = datasets.division_code
        and role in ('staff', 'spv', 'head')
    )
  )
  with check (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.user_divisions
      where user_id = auth.uid()
        and division_code = datasets.division_code
        and role in ('staff', 'spv', 'head')
    )
  );

drop policy if exists "dataset_columns_select" on public.dataset_columns;
create policy "dataset_columns_select"
  on public.dataset_columns for select
  to authenticated
  using (
    exists (
      select 1 from public.datasets d
      where d.id = dataset_columns.dataset_id
        and (
          public.is_admin(auth.uid())
          or public.is_direksi(auth.uid())
          or d.division_code in (
            select division_code from public.user_divisions where user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "dataset_columns_write_admin_or_member" on public.dataset_columns;
create policy "dataset_columns_write_admin_or_member"
  on public.dataset_columns for all
  to authenticated
  using (
    exists (
      select 1 from public.datasets d
      where d.id = dataset_columns.dataset_id
        and (
          public.is_admin(auth.uid())
          or exists (
            select 1 from public.user_divisions
            where user_id = auth.uid()
              and division_code = d.division_code
              and role in ('staff', 'spv', 'head')
          )
        )
    )
  )
  with check (true);

-- ---------------------------------------------------------------------
-- 4. FUNCTION: create_dynamic_table
-- ---------------------------------------------------------------------
-- SECURITY DEFINER karena perlu CREATE TABLE & policy DDL.
-- Validasi ketat dengan regex + whitelist data_type sebelum format('%I').
-- ---------------------------------------------------------------------
create or replace function public.create_dynamic_table(
  p_physical_name text,
  p_columns jsonb,
  p_division_code text,
  p_display_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dataset_id uuid;
  v_user_id uuid := auth.uid();
  v_col jsonb;
  v_col_name text;
  v_col_type text;
  v_pg_type text;
  v_col_sql text := '';
  v_position int := 0;
  v_create_sql text;
begin
  -- Auth check
  if v_user_id is null then
    raise exception 'Tidak terautentikasi.';
  end if;

  -- RBAC: user harus admin atau punya role staff/spv/head di divisi yg dimaksud
  if not (
    public.is_admin(v_user_id)
    or exists (
      select 1 from public.user_divisions
      where user_id = v_user_id
        and division_code = p_division_code
        and role in ('staff', 'spv', 'head')
    )
  ) then
    raise exception 'Anda tidak punya akses untuk membuat dataset di divisi %.', p_division_code;
  end if;

  -- Validasi physical_name
  if p_physical_name is null or p_physical_name !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Nama tabel fisik tidak valid: %', p_physical_name;
  end if;

  -- Cek duplikat
  if exists (select 1 from public.datasets where physical_table_name = p_physical_name) then
    raise exception 'Nama tabel sudah dipakai: %', p_physical_name;
  end if;

  -- Validasi: minimal 1 kolom
  if jsonb_array_length(p_columns) = 0 then
    raise exception 'Minimal harus ada 1 kolom data.';
  end if;

  -- Build kolom SQL
  for v_col in select * from jsonb_array_elements(p_columns)
  loop
    v_col_name := v_col->>'physical_name';
    v_col_type := v_col->>'data_type';

    if v_col_name !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'Nama kolom tidak valid: %', v_col_name;
    end if;

    v_pg_type := case v_col_type
      when 'text'     then 'text'
      when 'number'   then 'numeric'
      when 'currency' then 'numeric'
      when 'date'     then 'date'
      when 'boolean'  then 'boolean'
      when 'phone'    then 'text'
      when 'email'    then 'text'
      else null
    end;

    if v_pg_type is null then
      raise exception 'Tipe data tidak dikenali: %', v_col_type;
    end if;

    v_col_sql := v_col_sql || format(', %I %s', v_col_name, v_pg_type);
  end loop;

  -- CREATE TABLE
  v_create_sql := format(
    'create table public.%I (' ||
    '_id uuid primary key default gen_random_uuid(), ' ||
    '_import_job_id uuid, ' ||
    '_imported_at timestamptz not null default now(), ' ||
    '_imported_by uuid references public.user_profiles(id), ' ||
    '_source_file_url text, ' ||
    '_deleted_at timestamptz' ||
    '%s' ||
    ')',
    p_physical_name,
    v_col_sql
  );
  execute v_create_sql;

  -- Aktifkan RLS pada tabel dinamis
  execute format('alter table public.%I enable row level security', p_physical_name);

  -- Policy SELECT: user di divisi sama, admin, atau direksi; hide soft-deleted
  execute format(
    'create policy %I on public.%I for select to authenticated using (' ||
      '_deleted_at is null and (' ||
        'public.is_admin(auth.uid()) or ' ||
        'public.is_direksi(auth.uid()) or ' ||
        '%L in (select division_code from public.user_divisions where user_id = auth.uid())' ||
      ')' ||
    ')',
    p_physical_name || '_select',
    p_physical_name,
    p_division_code
  );

  -- Policy INSERT: admin atau staff/spv/head di divisi
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (' ||
      'public.is_admin(auth.uid()) or ' ||
      'exists (select 1 from public.user_divisions where user_id = auth.uid() and ' ||
        'division_code = %L and role in (''staff'', ''spv'', ''head''))' ||
    ')',
    p_physical_name || '_insert',
    p_physical_name,
    p_division_code
  );

  -- Insert metadata datasets
  insert into public.datasets (
    physical_table_name, display_name, description, division_code, created_by
  ) values (
    p_physical_name, p_display_name, p_description, p_division_code, v_user_id
  )
  returning id into v_dataset_id;

  -- Insert dataset_columns
  for v_col in select * from jsonb_array_elements(p_columns)
  loop
    v_position := v_position + 1;
    insert into public.dataset_columns (
      dataset_id, physical_column_name, display_name, data_type,
      is_required, is_unique_key, position
    ) values (
      v_dataset_id,
      v_col->>'physical_name',
      v_col->>'display_name',
      v_col->>'data_type',
      coalesce((v_col->>'is_required')::boolean, false),
      coalesce((v_col->>'is_unique_key')::boolean, false),
      v_position
    );
  end loop;

  return v_dataset_id;
end;
$$;

comment on function public.create_dynamic_table is
  'Bikin tabel dinamis dengan validasi identifier ketat (anti SQL injection). Mengembalikan dataset_id baru.';
