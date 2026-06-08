-- =====================================================================
-- Fix: PostgREST schema cache reload setelah create_dynamic_table
-- =====================================================================
-- Setelah CREATE TABLE dinamis, PostgREST (REST API Supabase) belum tahu
-- tabel baru itu sampai schema cache di-reload. Solusi: kirim NOTIFY pgrst
-- supaya PostgREST langsung re-introspect schema.
--
-- Ini cara resmi & ringan — PostgREST mendengarkan channel ini.
-- =====================================================================

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

  execute format('alter table public.%I enable row level security', p_physical_name);

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

  -- BERIKAN akses INSERT ke service_role & authenticated (bypass GRANT default)
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

  -- ⚡ Notify PostgREST to reload schema cache so the new table is queryable immediately.
  notify pgrst, 'reload schema';

  return v_dataset_id;
end;
$$;

-- ---------------------------------------------------------------------
-- FUNCTION: insert rows ke tabel dinamis via SQL (fallback kalau PostgREST
-- masih belum reload cache). Dipanggil oleh server action.
-- ---------------------------------------------------------------------
create or replace function public.insert_dynamic_rows(
  p_physical_name text,
  p_rows jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted int := 0;
  v_dataset record;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi.';
  end if;

  -- Validasi nama tabel
  if p_physical_name !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Nama tabel tidak valid: %', p_physical_name;
  end if;

  -- Cek dataset ada & user punya akses
  select d.division_code into v_dataset
  from public.datasets d
  where d.physical_table_name = p_physical_name;

  if v_dataset is null then
    raise exception 'Dataset % tidak ditemukan.', p_physical_name;
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

  -- Insert via jsonb_populate_record... lebih simpel pakai jsonb_to_recordset dynamic
  execute format(
    'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
    p_physical_name,
    p_physical_name
  ) using p_rows;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
