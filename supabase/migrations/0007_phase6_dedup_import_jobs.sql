-- =====================================================================
-- Phase 6: Dedup + raw backup + import_jobs tracking
-- =====================================================================
-- 1. Tabel import_jobs (audit setiap upload)
-- 2. Tambah kolom _row_hash di create_dynamic_table + index
-- 3. RPC insert_dynamic_rows_with_dedup (mode skip/update/insert)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL: import_jobs
-- ---------------------------------------------------------------------
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid references public.datasets(id) on delete cascade,
  division_code text references public.divisions(code) on delete set null,

  file_name text,
  file_hash text,  -- SHA-256, indexed untuk dedup file
  source_file_url text,  -- path di Supabase Storage bucket raw-imports

  status text not null default 'processing' check (
    status in ('queued', 'processing', 'done', 'failed')
  ),
  mode text check (mode in ('create', 'append_skip', 'append_update', 'append_insert')),

  total_rows int default 0,
  rows_inserted int default 0,
  rows_skipped int default 0,
  rows_updated int default 0,
  rows_failed int default 0,

  error_summary jsonb,
  is_backfill boolean not null default false,

  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_import_jobs_dataset on public.import_jobs(dataset_id);
create index if not exists idx_import_jobs_file_hash on public.import_jobs(file_hash) where file_hash is not null;
create index if not exists idx_import_jobs_created on public.import_jobs(created_at desc);

alter table public.import_jobs enable row level security;

drop policy if exists "import_jobs_select" on public.import_jobs;
create policy "import_jobs_select"
  on public.import_jobs for select to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_direksi(auth.uid())
    or division_code in (
      select division_code from public.user_divisions where user_id = auth.uid()
    )
    or created_by = auth.uid()
  );

drop policy if exists "import_jobs_write" on public.import_jobs;
create policy "import_jobs_write"
  on public.import_jobs for all to authenticated
  using (
    public.is_admin(auth.uid())
    or created_by = auth.uid()
  )
  with check (true);

-- ---------------------------------------------------------------------
-- 2. Update create_dynamic_table — tambah kolom _row_hash + index
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
  if v_user_id is null then
    raise exception 'Tidak terautentikasi.';
  end if;

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

  if p_physical_name is null or p_physical_name !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Nama tabel fisik tidak valid: %', p_physical_name;
  end if;

  if exists (select 1 from public.datasets where physical_table_name = p_physical_name) then
    raise exception 'Nama tabel sudah dipakai: %', p_physical_name;
  end if;

  if jsonb_array_length(p_columns) = 0 then
    raise exception 'Minimal harus ada 1 kolom data.';
  end if;

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

  -- CREATE TABLE: tambah _row_hash di kolom system
  v_create_sql := format(
    'create table public.%I (' ||
    '_id uuid primary key default gen_random_uuid(), ' ||
    '_import_job_id uuid, ' ||
    '_imported_at timestamptz not null default now(), ' ||
    '_imported_by uuid references public.user_profiles(id), ' ||
    '_source_file_url text, ' ||
    '_deleted_at timestamptz, ' ||
    '_row_hash text, ' ||
    '_normalized_phone text, ' ||
    '_normalized_email text, ' ||
    '_normalized_sku text, ' ||
    '_normalized_nik text' ||
    '%s' ||
    ')',
    p_physical_name,
    v_col_sql
  );
  execute v_create_sql;

  -- Index pada _row_hash untuk dedup cepat
  execute format(
    'create index %I on public.%I (_row_hash) where _row_hash is not null and _deleted_at is null',
    p_physical_name || '_rh_idx', p_physical_name
  );

  execute format(
    'create index %I on public.%I (_normalized_phone) where _normalized_phone is not null',
    p_physical_name || '_np_idx', p_physical_name
  );
  execute format(
    'create index %I on public.%I (_normalized_email) where _normalized_email is not null',
    p_physical_name || '_ne_idx', p_physical_name
  );

  execute format('alter table public.%I enable row level security', p_physical_name);

  execute format(
    'create policy dataset_select on public.%I for select to authenticated using (' ||
      '_deleted_at is null and (' ||
        'public.is_admin(auth.uid()) or ' ||
        'public.is_direksi(auth.uid()) or ' ||
        '%L in (select division_code from public.user_divisions where user_id = auth.uid())' ||
      ')' ||
    ')',
    p_physical_name,
    p_division_code
  );

  execute format(
    'create policy dataset_insert on public.%I for insert to authenticated with check (' ||
      'public.is_admin(auth.uid()) or ' ||
      'exists (select 1 from public.user_divisions where user_id = auth.uid() and ' ||
        'division_code = %L and role in (''staff'', ''spv'', ''head''))' ||
    ')',
    p_physical_name,
    p_division_code
  );

  execute format('grant select, insert, update on public.%I to authenticated', p_physical_name);
  execute format('grant all on public.%I to service_role', p_physical_name);

  insert into public.datasets (
    physical_table_name, display_name, description, division_code, created_by
  ) values (
    p_physical_name, p_display_name, p_description, p_division_code, v_user_id
  )
  returning id into v_dataset_id;

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

  notify pgrst, 'reload schema';

  return v_dataset_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. RPC: insert_dynamic_rows_with_dedup
-- ---------------------------------------------------------------------
-- Mode:
--   'skip'   — kalau _row_hash sudah ada (dan tidak soft-deleted), skip baris
--   'update' — kalau ada, UPDATE; kalau tidak, insert
--   'insert' — selalu insert (tidak peduli duplikat)
--
-- Return: jsonb dengan { inserted, skipped, updated }
-- ---------------------------------------------------------------------
create or replace function public.insert_dynamic_rows_with_dedup(
  p_physical_name text,
  p_rows jsonb,
  p_mode text default 'skip',
  p_import_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_dataset record;
  v_inserted int := 0;
  v_skipped int := 0;
  v_updated int := 0;
  v_row jsonb;
  v_row_hash text;
  v_existing_id uuid;
  v_cols_to_set text;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi.';
  end if;

  if p_mode not in ('skip', 'update', 'insert') then
    raise exception 'Mode tidak dikenali: % (harus skip/update/insert)', p_mode;
  end if;

  if p_physical_name !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Nama tabel tidak valid: %', p_physical_name;
  end if;

  select id, division_code into v_dataset
  from public.datasets
  where physical_table_name = p_physical_name;

  if v_dataset is null then
    raise exception 'Dataset tidak ditemukan: %', p_physical_name;
  end if;

  if not (
    public.is_admin(v_user_id)
    or exists (
      select 1 from public.user_divisions
      where user_id = v_user_id
        and division_code = v_dataset.division_code
        and role in ('staff', 'spv', 'head')
    )
  ) then
    raise exception 'Anda tidak punya akses untuk insert ke %.', p_physical_name;
  end if;

  -- Loop tiap baris
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_row_hash := v_row->>'_row_hash';
    v_existing_id := null;

    -- Cek duplikat hanya kalau row_hash ada
    if v_row_hash is not null and v_row_hash <> '' then
      execute format(
        'select _id from public.%I where _row_hash = $1 and _deleted_at is null limit 1',
        p_physical_name
      )
      using v_row_hash
      into v_existing_id;
    end if;

    if v_existing_id is not null then
      -- Duplikat ditemukan
      if p_mode = 'skip' then
        v_skipped := v_skipped + 1;
        continue;
      elsif p_mode = 'update' then
        -- UPDATE: pakai jsonb_populate_record + dynamic SQL
        execute format(
          'update public.%I set (_imported_at, _imported_by, _import_job_id) = (now(), $2, $3) where _id = $1',
          p_physical_name
        )
        using v_existing_id, v_user_id, p_import_job_id;

        -- Note: untuk update kolom user, butuh kolom list dinamis.
        -- Untuk MVP Phase 6, mode update hanya update kolom system + skip body update.
        -- Body update full: pakai jsonb_each loop di iterasi berikutnya.
        v_updated := v_updated + 1;
        continue;
      end if;
      -- mode 'insert' fall-through → tetap insert baris baru
    end if;

    -- INSERT baris baru
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
      p_physical_name, p_physical_name
    )
    using v_row;
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'updated', v_updated
  );
end;
$$;
