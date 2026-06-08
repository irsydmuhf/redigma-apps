-- =====================================================================
-- RPC sync_crm_dataset: ETL dari tabel CSV mentah → tabel master CRM
-- =====================================================================
-- Cara kerja:
-- 1. Baca mapping di crm_dataset_mappings untuk dataset_id
-- 2. Untuk setiap row di tabel CSV mentah (yang _deleted_at IS NULL):
--    - Build record sesuai column_map
--    - Upsert ke crm_customers (dedup by phone/email)
--    - Atau insert ke crm_transactions (dedup by order_id)
-- 3. Log hasil ke crm_sync_log
--
-- Mode: 'auto' (dipanggil trigger) | 'manual' (admin klik tombol) | 'rebuild_all'
-- =====================================================================

create or replace function public.sync_crm_dataset(
  p_dataset_id uuid,
  p_mode text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  v_table text;
  v_sql text;
  v_result_per_table jsonb := '{}'::jsonb;
  v_per_table_result record;
begin
  -- Auth (kalau dari trigger, auth.uid() bisa null — pakai system mode)
  -- Kalau manual, wajib admin atau anggota divisi crm/cs.
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

  -- Get dataset
  select * into v_dataset from public.datasets where id = p_dataset_id;
  if v_dataset is null then
    raise exception 'Dataset tidak ditemukan: %', p_dataset_id;
  end if;

  -- Iterate mappings untuk dataset ini
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

  -- Log hasil
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
-- Helper function: sync to crm_customers
-- ---------------------------------------------------------------------
create or replace function public.sync_to_crm_customers(
  p_source_table text,
  p_dataset_id uuid,
  p_column_map jsonb
)
returns table (processed int, inserted int, updated int, skipped int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name_col text := p_column_map->>'full_name';
  v_phone_col text := p_column_map->>'phone';
  v_email_col text := p_column_map->>'email';
  v_address_col text := p_column_map->>'address';
  v_city_col text := p_column_map->>'city';
  v_province_col text := p_column_map->>'province';
  v_sql text;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_total int := 0;
begin
  -- Validate identifier (anti SQL injection)
  if p_source_table !~ '^[a-z_][a-z0-9_]*$' then
    raise exception 'Invalid source table: %', p_source_table;
  end if;

  -- Build dynamic SQL untuk upsert ke crm_customers
  v_sql := format($s$
    with src as (
      select
        %s as full_name_val,
        %s as phone_val,
        %s as email_val,
        %s as address_val,
        %s as city_val,
        %s as province_val,
        to_jsonb(t.*) as raw_data
      from public.%I t
      where t._deleted_at is null
    ),
    normalized as (
      select
        nullif(trim(coalesce(full_name_val::text, '')), '') as full_name,
        case
          when phone_val::text ~ '^\d+$' then phone_val::text
          when phone_val::text ~ '^0\d+$' then '62' || substring(phone_val::text from 2)
          when phone_val::text ~ '^\+\d+$' then substring(phone_val::text from 2)
          else nullif(regexp_replace(phone_val::text, '[^0-9]', '', 'g'), '')
        end as phone,
        lower(nullif(trim(coalesce(email_val::text, '')), '')) as email,
        nullif(trim(coalesce(address_val::text, '')), '') as address,
        nullif(trim(coalesce(city_val::text, '')), '') as city,
        nullif(trim(coalesce(province_val::text, '')), '') as province,
        raw_data
      from src
    ),
    inserted_or_updated as (
      insert into public.crm_customers as c (
        full_name, phone, email, address, city, province,
        raw_data, source_dataset_id, updated_at
      )
      select full_name, phone, email, address, city, province,
             raw_data, %L::uuid, now()
      from normalized
      where coalesce(phone, email) is not null
      on conflict (phone) where phone is not null do update set
        full_name = coalesce(excluded.full_name, c.full_name),
        email = coalesce(excluded.email, c.email),
        address = coalesce(excluded.address, c.address),
        city = coalesce(excluded.city, c.city),
        province = coalesce(excluded.province, c.province),
        raw_data = excluded.raw_data,
        source_dataset_id = excluded.source_dataset_id,
        updated_at = now()
      returning (xmax = 0) as is_new
    )
    select
      count(*) as total,
      count(*) filter (where is_new) as inserted_count,
      count(*) filter (where not is_new) as updated_count
    from inserted_or_updated
  $s$,
    case when v_full_name_col is not null and v_full_name_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_full_name_col) else 'NULL' end,
    case when v_phone_col is not null and v_phone_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_phone_col) else 'NULL' end,
    case when v_email_col is not null and v_email_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_email_col) else 'NULL' end,
    case when v_address_col is not null and v_address_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_address_col) else 'NULL' end,
    case when v_city_col is not null and v_city_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_city_col) else 'NULL' end,
    case when v_province_col is not null and v_province_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_province_col) else 'NULL' end,
    p_source_table,
    p_dataset_id
  );

  -- Execute & capture counts
  execute v_sql into v_total, v_inserted, v_updated;
  v_skipped := 0;  -- All rows accepted (phone-only dedup)

  processed := coalesce(v_total, 0);
  inserted := coalesce(v_inserted, 0);
  updated := coalesce(v_updated, 0);
  skipped := v_skipped;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- Helper function: sync to crm_transactions
-- ---------------------------------------------------------------------
create or replace function public.sync_to_crm_transactions(
  p_source_table text,
  p_dataset_id uuid,
  p_column_map jsonb
)
returns table (processed int, inserted int, updated int, skipped int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id_col text := p_column_map->>'order_id';
  v_phone_col text := p_column_map->>'phone';
  v_amount_col text := p_column_map->>'amount';
  v_channel_col text := p_column_map->>'channel';
  v_status_col text := p_column_map->>'status';
  v_date_col text := p_column_map->>'occurred_at';
  v_sql text;
  v_inserted int := 0;
  v_updated int := 0;
  v_total int := 0;
begin
  if p_source_table !~ '^[a-z_][a-z0-9_]*$' then
    raise exception 'Invalid source table: %', p_source_table;
  end if;

  v_sql := format($s$
    with src as (
      select
        %s::text as order_id_val,
        %s::text as phone_raw,
        %s::text as amount_raw,
        %s::text as channel_val,
        %s::text as status_val,
        %s::text as date_val,
        to_jsonb(t.*) as raw_data
      from public.%I t
      where t._deleted_at is null
    ),
    normalized as (
      select
        nullif(trim(order_id_val), '') as order_id,
        case
          when phone_raw ~ '^\d+$' then phone_raw
          when phone_raw ~ '^0\d+$' then '62' || substring(phone_raw from 2)
          else nullif(regexp_replace(coalesce(phone_raw, ''), '[^0-9]', '', 'g'), '')
        end as phone,
        nullif(regexp_replace(coalesce(amount_raw, '0'), '[^0-9.]', '', 'g'), '')::numeric as amount,
        nullif(trim(coalesce(channel_val, '')), '') as channel,
        nullif(trim(coalesce(status_val, '')), '') as status,
        nullif(trim(coalesce(date_val, '')), '')::timestamptz as occurred_at,
        raw_data
      from src
    ),
    inserted_rows as (
      insert into public.crm_transactions as t (
        customer_id, order_id, amount, channel, status, occurred_at,
        raw_data, source_dataset_id
      )
      select
        (select id from public.crm_customers where phone = n.phone limit 1),
        n.order_id, coalesce(n.amount, 0), n.channel, n.status, n.occurred_at,
        n.raw_data, %L::uuid
      from normalized n
      on conflict (order_id) where order_id is not null do update set
        amount = excluded.amount,
        status = excluded.status,
        occurred_at = excluded.occurred_at,
        raw_data = excluded.raw_data
      returning (xmax = 0) as is_new
    )
    select
      count(*) as total,
      count(*) filter (where is_new) as inserted_count,
      count(*) filter (where not is_new) as updated_count
    from inserted_rows
  $s$,
    case when v_order_id_col is not null and v_order_id_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_order_id_col) else 'NULL' end,
    case when v_phone_col is not null and v_phone_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_phone_col) else 'NULL' end,
    case when v_amount_col is not null and v_amount_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_amount_col) else '''0''' end,
    case when v_channel_col is not null and v_channel_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_channel_col) else 'NULL' end,
    case when v_status_col is not null and v_status_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_status_col) else 'NULL' end,
    case when v_date_col is not null and v_date_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_date_col) else 'NULL' end,
    p_source_table,
    p_dataset_id
  );

  execute v_sql into v_total, v_inserted, v_updated;

  processed := coalesce(v_total, 0);
  inserted := coalesce(v_inserted, 0);
  updated := coalesce(v_updated, 0);
  skipped := 0;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- TRIGGER: auto-sync setelah import_jobs status berubah jadi 'done'
-- ---------------------------------------------------------------------
create or replace function public.trigger_crm_auto_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Hanya trigger kalau status berubah jadi 'done' (dari yang lain)
  if NEW.status = 'done' and (OLD.status is null or OLD.status <> 'done') then
    -- Cek apakah dataset ini punya mapping aktif
    if exists (
      select 1 from public.crm_dataset_mappings
      where dataset_id = NEW.dataset_id and is_active = true
    ) then
      -- Best effort: kalau sync gagal, jangan rollback import.
      begin
        perform public.sync_crm_dataset(NEW.dataset_id, 'auto');
      exception when others then
        -- Log error tapi jangan stop import_jobs update
        insert into public.crm_sync_log (
          dataset_id, mode, status, error_summary
        ) values (
          NEW.dataset_id, 'auto', 'failed',
          jsonb_build_object('error', SQLERRM, 'trigger', 'auto_sync')
        );
      end;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_import_done_sync_crm on public.import_jobs;
create trigger on_import_done_sync_crm
  after insert or update of status on public.import_jobs
  for each row execute function public.trigger_crm_auto_sync();

-- ---------------------------------------------------------------------
-- RPC: rebuild_all_crm — admin only
-- ---------------------------------------------------------------------
create or replace function public.rebuild_all_crm()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_mapping record;
  v_result jsonb := '[]'::jsonb;
  v_per_result jsonb;
begin
  if not public.is_admin(v_user_id) then
    raise exception 'Hanya admin yang bisa rebuild all.';
  end if;

  for v_mapping in
    select distinct dataset_id from public.crm_dataset_mappings
    where is_active = true
  loop
    begin
      v_per_result := public.sync_crm_dataset(v_mapping.dataset_id, 'rebuild_all');
      v_result := v_result || jsonb_build_array(
        jsonb_build_object('dataset_id', v_mapping.dataset_id, 'result', v_per_result)
      );
    exception when others then
      v_result := v_result || jsonb_build_array(
        jsonb_build_object('dataset_id', v_mapping.dataset_id, 'error', SQLERRM)
      );
    end;
  end loop;

  return jsonb_build_object('runs', v_result);
end;
$$;
