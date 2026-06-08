-- =====================================================================
-- Fix: "canceling statement due to lock timeout" saat sync CRM
-- =====================================================================
-- Penyebab:
-- 1. Trigger trg_update_customer_aggregates (migration 0022) jalan per-row
--    saat bulk insert/update crm_transactions → tiap row kunci crm_customers
-- 2. Kalau ada session lain (mis. tab CRM browser) yang akses crm_customers
--    → konflik lock → PostgreSQL cancel statement
--
-- Solusi:
-- 1. Tambah lock_timeout = '5min' di RPC sync (default Supabase bisa pendek)
-- 2. Skip user trigger selama bulk sync via session_replication_role='replica'
--    (lebih cepat, lalu recompute aggregates di akhir dalam 1 UPDATE batch)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. recalculate_all_customer_aggregates — tambah lock_timeout
-- ---------------------------------------------------------------------
create or replace function public.recalculate_all_customer_aggregates()
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '10min'
set lock_timeout = '5min'
as $$
declare
  v_updated int;
begin
  with tx_stats as (
    select
      customer_id,
      sum(amount) as total_amount,
      count(*) as total_count,
      max(occurred_at) as last_order
    from public.crm_transactions
    where customer_id is not null
    group by customer_id
  ),
  with_rfm as (
    select
      ts.customer_id,
      ts.total_amount,
      ts.total_count,
      ts.last_order,
      (rfm.*)
    from tx_stats ts
    cross join lateral public.compute_rfm_segment(
      case when ts.last_order is not null
           then extract(day from now() - ts.last_order)::int
           else null end,
      ts.total_count::int,
      ts.total_amount
    ) rfm
  )
  update public.crm_customers c set
    total_spent = wr.total_amount,
    total_orders = wr.total_count,
    last_purchase_at = wr.last_order,
    rfm_recency = wr.recency,
    rfm_frequency = wr.frequency,
    rfm_monetary = wr.monetary,
    segment_rfm = wr.segment,
    updated_at = now()
  from with_rfm wr
  where c.id = wr.customer_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. sync_to_crm_customers — tambah lock_timeout
-- ---------------------------------------------------------------------
alter function public.sync_to_crm_customers(text, uuid, jsonb)
  set lock_timeout = '5min';

-- ---------------------------------------------------------------------
-- 3. sync_to_crm_transactions — tambah lock_timeout
-- ---------------------------------------------------------------------
alter function public.sync_to_crm_transactions(text, uuid, jsonb)
  set lock_timeout = '5min';

-- ---------------------------------------------------------------------
-- 4. sync_crm_dataset — tambah lock_timeout + skip user trigger saat bulk
-- ---------------------------------------------------------------------
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

  -- KUNCI: skip USER trigger selama bulk sync supaya tidak per-row lock
  -- crm_customers. Aggregates tetap di-recompute di akhir dalam 1 UPDATE batch.
  -- 'true' = LOCAL ke transaksi ini, auto-reset di akhir.
  perform set_config('session_replication_role', 'replica', true);

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

  -- Recompute aggregates batch (gantinya per-row trigger yang baru saja di-skip)
  if v_result_per_table ? 'crm_transactions' then
    v_aggregates_updated := public.recalculate_all_customer_aggregates();
    v_result_per_table := v_result_per_table ||
      jsonb_build_object('aggregates_updated', v_aggregates_updated);
  end if;

  -- Reset session_replication_role ke default ('origin')
  perform set_config('session_replication_role', 'origin', true);

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
  -- Pastikan session_replication_role di-reset meski error
  perform set_config('session_replication_role', 'origin', true);

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
