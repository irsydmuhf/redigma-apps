-- =====================================================================
-- Fix migration 0024: ganti session_replication_role (butuh superuser
-- di Supabase) dengan ALTER TABLE DISABLE/ENABLE TRIGGER
-- =====================================================================
-- session_replication_role = 'replica' butuh role superuser, tidak bisa
-- dijalankan dari SECURITY DEFINER user biasa di Supabase managed.
--
-- Solusi: pakai ALTER TABLE crm_transactions DISABLE TRIGGER ... di awal
-- sync, ENABLE di akhir. Tabel owner = postgres (sama dengan owner RPC),
-- jadi SECURITY DEFINER bisa ALTER.
-- =====================================================================

create or replace function public.sync_crm_dataset(
  p_dataset_id uuid,
  p_mode text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '15min'
set lock_timeout = '5min'
as $$
declare
  v_user_id uuid := auth.uid();
  v_dataset record;
  v_mapping record;
  v_started_at timestamptz := clock_timestamp();
  v_total_inserted int := 0;
  v_total_updated int := 0;
  v_total_skipped int := 0;
  v_total_processed int := 0;
  v_result_per_table jsonb := '{}'::jsonb;
  v_per_table_result record;
  v_aggregates_updated int := 0;
  v_trigger_disabled boolean := false;
begin
  if p_mode <> 'auto' and v_user_id is not null then
    if not (
      public.is_admin(v_user_id)
      or exists (
        select 1 from public.user_divisions
        where user_id = v_user_id
          and division_code in ('crm', 'crm_b2b', 'cs', 'data_it')
          and role in ('staff', 'spv', 'head')
      )
    ) then
      raise exception 'Anda tidak punya akses untuk sync CRM.';
    end if;
  end if;

  select * into v_dataset from public.datasets where id = p_dataset_id;
  if v_dataset is null then
    raise exception 'Dataset tidak ditemukan: %', p_dataset_id;
  end if;

  -- Disable trigger per-row aggregates supaya bulk insert/update cepat
  -- dan tidak lock crm_customers row-by-row. Aggregates di-recompute di
  -- akhir dalam 1 UPDATE batch.
  alter table public.crm_transactions
    disable trigger trg_update_customer_aggregates;
  v_trigger_disabled := true;

  for v_mapping in
    select * from public.crm_dataset_mappings
    where dataset_id = p_dataset_id and is_active = true
  loop
    if v_mapping.target_table = 'crm_customers' then
      v_per_table_result := sync_to_crm_customers(
        v_dataset.physical_table_name,
        v_dataset.id,
        v_mapping.column_map
      );
    elsif v_mapping.target_table = 'crm_transactions' then
      v_per_table_result := sync_to_crm_transactions(
        v_dataset.physical_table_name,
        v_dataset.id,
        v_mapping.column_map
      );
    else
      continue;
    end if;

    v_total_processed := v_total_processed + v_per_table_result.processed;
    v_total_inserted := v_total_inserted + v_per_table_result.inserted;
    v_total_updated := v_total_updated + v_per_table_result.updated;
    v_total_skipped := v_total_skipped + v_per_table_result.skipped;
    v_result_per_table := v_result_per_table || jsonb_build_object(
      v_mapping.target_table,
      jsonb_build_object(
        'processed', v_per_table_result.processed,
        'inserted', v_per_table_result.inserted,
        'updated', v_per_table_result.updated,
        'skipped', v_per_table_result.skipped
      )
    );
  end loop;

  -- Recompute aggregates batch (gantinya per-row trigger yang baru di-skip)
  if v_result_per_table ? 'crm_transactions' then
    v_aggregates_updated := public.recalculate_all_customer_aggregates();
    v_result_per_table := v_result_per_table ||
      jsonb_build_object('aggregates_updated', v_aggregates_updated);
  end if;

  -- Enable trigger lagi
  alter table public.crm_transactions
    enable trigger trg_update_customer_aggregates;
  v_trigger_disabled := false;

  insert into public.crm_sync_log (
    dataset_id, target_table, mode, status,
    rows_processed, rows_inserted, rows_updated, rows_skipped,
    duration_ms, run_by, error_summary
  ) values (
    p_dataset_id, null, p_mode, 'success',
    v_total_processed, v_total_inserted, v_total_updated, v_total_skipped,
    extract(milliseconds from clock_timestamp() - v_started_at)::int,
    v_user_id,
    v_result_per_table
  );

  return jsonb_build_object(
    'success', true,
    'processed', v_total_processed,
    'inserted', v_total_inserted,
    'updated', v_total_updated,
    'skipped', v_total_skipped,
    'aggregates_updated', v_aggregates_updated,
    'per_table', v_result_per_table
  );

exception when others then
  -- Pastikan trigger di-enable ulang meski error
  if v_trigger_disabled then
    begin
      alter table public.crm_transactions
        enable trigger trg_update_customer_aggregates;
    exception when others then
      null; -- jangan blok exception asli
    end;
  end if;

  insert into public.crm_sync_log (
    dataset_id, mode, status, error_summary, run_by, duration_ms
  ) values (
    p_dataset_id, p_mode, 'failed',
    jsonb_build_object('error', SQLERRM, 'state', SQLSTATE),
    v_user_id,
    extract(milliseconds from clock_timestamp() - v_started_at)::int
  );
  raise;
end;
$$;

notify pgrst, 'reload schema';
