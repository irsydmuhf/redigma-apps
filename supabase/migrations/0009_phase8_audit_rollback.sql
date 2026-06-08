-- =====================================================================
-- Phase 8: Audit log + rollback + restore + permanent delete
-- =====================================================================
-- 1. Tabel audit_log
-- 2. Kolom rolled_back_at di import_jobs
-- 3. RPC rollback_import (soft delete batch baris)
-- 4. RPC restore_import (un-soft-delete)
-- 5. RPC permanent_delete_import (DELETE FROM, admin only)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL audit_log
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_user on public.audit_log(user_id, created_at desc);
create index if not exists idx_audit_log_target on public.audit_log(target_type, target_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
  on public.audit_log for select to authenticated
  using (public.is_admin(auth.uid()) or user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. Kolom rolled_back_at di import_jobs
-- ---------------------------------------------------------------------
alter table public.import_jobs
  add column if not exists rolled_back_at timestamptz,
  add column if not exists rolled_back_by uuid references public.user_profiles(id);

create index if not exists idx_import_jobs_rolled_back
  on public.import_jobs(rolled_back_at)
  where rolled_back_at is not null;

-- ---------------------------------------------------------------------
-- 3. RPC: rollback_import
-- ---------------------------------------------------------------------
create or replace function public.rollback_import(p_import_job_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job record;
  v_dataset record;
  v_count int := 0;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi.';
  end if;

  select * into v_job from public.import_jobs where id = p_import_job_id;
  if v_job is null then
    raise exception 'Import job tidak ditemukan.';
  end if;

  if v_job.rolled_back_at is not null then
    raise exception 'Import ini sudah pernah di-rollback.';
  end if;

  select * into v_dataset from public.datasets where id = v_job.dataset_id;
  if v_dataset is null then
    raise exception 'Dataset tidak ditemukan.';
  end if;

  -- RBAC: admin, atau owner (created_by), atau spv/head di divisi
  if not (
    public.is_admin(v_user_id)
    or v_job.created_by = v_user_id
    or exists (
      select 1 from public.user_divisions
      where user_id = v_user_id
        and division_code = v_dataset.division_code
        and role in ('spv', 'head')
    )
  ) then
    raise exception 'Anda tidak punya akses untuk rollback import ini.';
  end if;

  -- Soft delete semua baris dengan _import_job_id ini
  execute format(
    'update public.%I set _deleted_at = now() where _import_job_id = $1 and _deleted_at is null',
    v_dataset.physical_table_name
  )
  using p_import_job_id;
  get diagnostics v_count = row_count;

  -- Update import_jobs
  update public.import_jobs
  set rolled_back_at = now(),
      rolled_back_by = v_user_id
  where id = p_import_job_id;

  -- Audit
  insert into public.audit_log (user_id, action, target_type, target_id, detail)
  values (
    v_user_id, 'rollback_import', 'import_job', p_import_job_id::text,
    jsonb_build_object(
      'dataset_id', v_dataset.id,
      'dataset_name', v_dataset.display_name,
      'rows_soft_deleted', v_count,
      'file_name', v_job.file_name
    )
  );

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. RPC: restore_import
-- ---------------------------------------------------------------------
create or replace function public.restore_import(p_import_job_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job record;
  v_dataset record;
  v_count int := 0;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi.';
  end if;

  select * into v_job from public.import_jobs where id = p_import_job_id;
  if v_job is null then
    raise exception 'Import job tidak ditemukan.';
  end if;

  if v_job.rolled_back_at is null then
    raise exception 'Import ini tidak dalam status rollback.';
  end if;

  select * into v_dataset from public.datasets where id = v_job.dataset_id;
  if v_dataset is null then
    raise exception 'Dataset tidak ditemukan.';
  end if;

  -- Restore: hanya admin atau owner
  if not (public.is_admin(v_user_id) or v_job.created_by = v_user_id) then
    raise exception 'Hanya admin atau pembuat import yang bisa restore.';
  end if;

  execute format(
    'update public.%I set _deleted_at = null where _import_job_id = $1 and _deleted_at is not null',
    v_dataset.physical_table_name
  )
  using p_import_job_id;
  get diagnostics v_count = row_count;

  update public.import_jobs
  set rolled_back_at = null, rolled_back_by = null
  where id = p_import_job_id;

  insert into public.audit_log (user_id, action, target_type, target_id, detail)
  values (
    v_user_id, 'restore_import', 'import_job', p_import_job_id::text,
    jsonb_build_object(
      'dataset_id', v_dataset.id,
      'dataset_name', v_dataset.display_name,
      'rows_restored', v_count
    )
  );

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RPC: permanent_delete_import (admin only)
-- ---------------------------------------------------------------------
create or replace function public.permanent_delete_import(p_import_job_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job record;
  v_dataset record;
  v_count int := 0;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi.';
  end if;

  if not public.is_admin(v_user_id) then
    raise exception 'Hanya admin yang bisa permanent delete.';
  end if;

  select * into v_job from public.import_jobs where id = p_import_job_id;
  if v_job is null then
    raise exception 'Import job tidak ditemukan.';
  end if;

  if v_job.rolled_back_at is null then
    raise exception 'Permanent delete hanya untuk import yang sudah di-rollback.';
  end if;

  select * into v_dataset from public.datasets where id = v_job.dataset_id;
  if v_dataset is null then
    raise exception 'Dataset tidak ditemukan.';
  end if;

  execute format(
    'delete from public.%I where _import_job_id = $1',
    v_dataset.physical_table_name
  )
  using p_import_job_id;
  get diagnostics v_count = row_count;

  insert into public.audit_log (user_id, action, target_type, target_id, detail)
  values (
    v_user_id, 'permanent_delete_import', 'import_job', p_import_job_id::text,
    jsonb_build_object(
      'dataset_id', v_dataset.id,
      'dataset_name', v_dataset.display_name,
      'rows_deleted', v_count,
      'file_name', v_job.file_name
    )
  );

  return v_count;
end;
$$;
