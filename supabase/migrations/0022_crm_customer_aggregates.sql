-- =====================================================================
-- Auto-compute customer aggregates dari crm_transactions
-- =====================================================================
-- Hitung untuk setiap customer:
--   - total_spent = sum(amount) dari semua transaksi-nya
--   - total_orders = count(*) transaksi
--   - last_purchase_at = max(occurred_at) tanggal order terakhir
--   - rfm_recency, rfm_frequency, rfm_monetary = skor 1-5 (RFM segmentation)
--   - segment_rfm = 'Champion' | 'Loyal' | 'At Risk' | 'New' | 'Lost' dll
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FUNCTION: hitung skor RFM (1-5) untuk 1 customer
-- ---------------------------------------------------------------------
create or replace function public.compute_rfm_segment(
  p_days_since_last int,
  p_total_orders int,
  p_total_spent numeric
)
returns table (
  recency int,
  frequency int,
  monetary int,
  segment text
)
language plpgsql
immutable
as $$
declare
  r int;
  f int;
  m int;
  total int;
begin
  -- R (Recency): kecil = baru beli, bagus (skor tinggi)
  r := case
    when p_days_since_last is null then 1
    when p_days_since_last <= 30 then 5
    when p_days_since_last <= 60 then 4
    when p_days_since_last <= 90 then 3
    when p_days_since_last <= 180 then 2
    else 1
  end;

  -- F (Frequency): banyak order = bagus
  f := case
    when p_total_orders >= 10 then 5
    when p_total_orders >= 5 then 4
    when p_total_orders >= 3 then 3
    when p_total_orders >= 2 then 2
    else 1
  end;

  -- M (Monetary): banyak omset = bagus (threshold untuk Indonesia)
  m := case
    when p_total_spent >= 5000000 then 5   -- > 5jt
    when p_total_spent >= 2000000 then 4   -- 2-5jt
    when p_total_spent >= 500000 then 3    -- 500rb-2jt
    when p_total_spent >= 100000 then 2    -- 100-500rb
    else 1
  end;

  total := r + f + m;

  segment := case
    when total >= 13 then 'Champion'
    when total >= 10 then 'Loyal'
    when total >= 8 then 'Potential'
    when total >= 6 then 'At Risk'
    when total >= 4 then 'Hibernating'
    else 'Lost'
  end;

  recency := r;
  frequency := f;
  monetary := m;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. FUNCTION: recalculate aggregates SEMUA customer
-- ---------------------------------------------------------------------
create or replace function public.recalculate_all_customer_aggregates()
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '10min'
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
-- 3. TRIGGER: auto-update saat ada transaksi baru / berubah
-- ---------------------------------------------------------------------
create or replace function public.trigger_update_customer_aggregates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := coalesce(NEW.customer_id, OLD.customer_id);
  v_total numeric;
  v_count int;
  v_last timestamptz;
  v_rfm record;
begin
  if v_customer_id is null then return NEW; end if;

  -- Hitung ulang untuk customer ini saja (lebih cepat dari full recalc)
  select sum(amount), count(*), max(occurred_at)
  into v_total, v_count, v_last
  from public.crm_transactions
  where customer_id = v_customer_id;

  select * into v_rfm from public.compute_rfm_segment(
    case when v_last is not null then extract(day from now() - v_last)::int else null end,
    coalesce(v_count, 0),
    coalesce(v_total, 0)
  );

  update public.crm_customers set
    total_spent = coalesce(v_total, 0),
    total_orders = coalesce(v_count, 0),
    last_purchase_at = v_last,
    rfm_recency = v_rfm.recency,
    rfm_frequency = v_rfm.frequency,
    rfm_monetary = v_rfm.monetary,
    segment_rfm = v_rfm.segment,
    updated_at = now()
  where id = v_customer_id;

  return NEW;
end;
$$;

drop trigger if exists trg_update_customer_aggregates on public.crm_transactions;
create trigger trg_update_customer_aggregates
  after insert or update or delete on public.crm_transactions
  for each row execute function public.trigger_update_customer_aggregates();

-- ---------------------------------------------------------------------
-- 4. Update sync_crm_dataset — panggil recalculate setelah sync
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

  -- KUNCI: recalculate aggregates setelah sync transactions
  if v_result_per_table ? 'crm_transactions' then
    v_aggregates_updated := public.recalculate_all_customer_aggregates();
    v_result_per_table := v_result_per_table ||
      jsonb_build_object('aggregates_updated', v_aggregates_updated);
  end if;

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

-- ---------------------------------------------------------------------
-- 5. RUN sekali sekarang untuk update SEMUA customer existing
-- ---------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  v_count := public.recalculate_all_customer_aggregates();
  raise notice 'Recalculated aggregates untuk % customer', v_count;
end $$;

notify pgrst, 'reload schema';
