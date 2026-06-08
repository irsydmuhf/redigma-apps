-- =====================================================================
-- Phase 5: Schema drift handling — ALTER TABLE ADD COLUMN + audit
-- =====================================================================
-- Tabel: schema_changelog (audit setiap perubahan struktur)
-- Function: alter_dynamic_table_add_column — ADD COLUMN safely + audit
-- =====================================================================

create table if not exists public.schema_changelog (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  change_type text not null check (change_type in (
    'add_column', 'drop_column', 'modify_column',
    'append_data', 'create_dataset'
  )),
  change_detail jsonb,
  changed_by uuid references public.user_profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists idx_schema_changelog_dataset
  on public.schema_changelog(dataset_id, changed_at desc);

alter table public.schema_changelog enable row level security;

drop policy if exists "schema_changelog_select" on public.schema_changelog;
create policy "schema_changelog_select"
  on public.schema_changelog for select to authenticated
  using (
    exists (
      select 1 from public.datasets d
      where d.id = schema_changelog.dataset_id
        and (
          public.is_admin(auth.uid())
          or public.is_direksi(auth.uid())
          or d.division_code in (
            select division_code from public.user_divisions where user_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- FUNCTION: alter_dynamic_table_add_column
-- ---------------------------------------------------------------------
create or replace function public.alter_dynamic_table_add_column(
  p_dataset_id uuid,
  p_physical_name text,
  p_display_name text,
  p_data_type text,
  p_is_unique_key boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_table_name text;
  v_division_code text;
  v_pg_type text;
  v_max_pos int;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi.';
  end if;

  -- Get target dataset
  select physical_table_name, division_code
    into v_table_name, v_division_code
  from public.datasets
  where id = p_dataset_id;

  if v_table_name is null then
    raise exception 'Dataset tidak ditemukan.';
  end if;

  -- RBAC
  if not (
    public.is_admin(v_user_id)
    or exists (
      select 1 from public.user_divisions
      where user_id = v_user_id
        and division_code = v_division_code
        and role in ('staff', 'spv', 'head')
    )
  ) then
    raise exception 'Anda tidak punya akses untuk ubah dataset ini.';
  end if;

  -- Validate
  if p_physical_name !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'Nama kolom tidak valid: %', p_physical_name;
  end if;

  if exists (
    select 1 from public.dataset_columns
    where dataset_id = p_dataset_id
      and physical_column_name = p_physical_name
  ) then
    raise exception 'Kolom % sudah ada di dataset ini.', p_physical_name;
  end if;

  v_pg_type := case p_data_type
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
    raise exception 'Tipe data tidak dikenali: %', p_data_type;
  end if;

  -- ALTER TABLE ADD COLUMN
  execute format(
    'alter table public.%I add column %I %s',
    v_table_name, p_physical_name, v_pg_type
  );

  -- Update metadata
  select coalesce(max(position), 0) into v_max_pos
  from public.dataset_columns where dataset_id = p_dataset_id;

  insert into public.dataset_columns (
    dataset_id, physical_column_name, display_name, data_type,
    is_required, is_unique_key, position
  ) values (
    p_dataset_id, p_physical_name, p_display_name, p_data_type,
    false, p_is_unique_key, v_max_pos + 1
  );

  -- Audit
  insert into public.schema_changelog (
    dataset_id, change_type, change_detail, changed_by
  ) values (
    p_dataset_id,
    'add_column',
    jsonb_build_object(
      'physical_name', p_physical_name,
      'display_name', p_display_name,
      'data_type', p_data_type,
      'is_unique_key', p_is_unique_key
    ),
    v_user_id
  );

  notify pgrst, 'reload schema';
end;
$$;

-- ---------------------------------------------------------------------
-- Tambahkan log audit di create_dynamic_table juga
-- ---------------------------------------------------------------------
-- (Tidak overwrite function-nya — cukup tambah trigger / helper terpisah
--  kalau perlu. Untuk MVP, skip dulu.)
