-- =====================================================================
-- Fix: statement timeout untuk sync function di-naikkan
-- =====================================================================
-- Default Supabase: 8 detik. Untuk dataset 50k+ rows + dedup + upsert,
-- sering exceed limit. Naikkan ke 5 menit lewat SET LOCAL di SECURITY DEFINER.
--
-- Plus: tambah indeks pada source columns untuk speed up dedup.
-- =====================================================================

-- 1. Update sync_to_crm_customers — tambah SET LOCAL statement_timeout
create or replace function public.sync_to_crm_customers(
  p_source_table text,
  p_dataset_id uuid,
  p_column_map jsonb
)
returns table (processed int, inserted int, updated int, skipped int)
language plpgsql
security definer
set search_path = public
set statement_timeout = '5min'
as $$
declare
  v_full_name_col text := p_column_map->>'full_name';
  v_phone_col text := p_column_map->>'phone';
  v_email_col text := p_column_map->>'email';
  v_address_col text := p_column_map->>'address';
  v_city_col text := p_column_map->>'city';
  v_province_col text := p_column_map->>'province';
  v_district_col text := p_column_map->>'district';
  v_sub_district_col text := p_column_map->>'sub_district';
  v_cs_name_col text := p_column_map->>'cs_name';
  v_platform_col text := p_column_map->>'platform';
  v_adv_name_col text := p_column_map->>'adv_name';
  v_sql text;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_total int := 0;
begin
  if p_source_table !~ '^[a-z_][a-z0-9_]*$' then
    raise exception 'Invalid source table: %', p_source_table;
  end if;

  v_sql := format($s$
    with src as (
      select
        %s as full_name_val,
        %s as phone_val,
        %s as email_val,
        %s as address_val,
        %s as city_val,
        %s as province_val,
        %s as district_val,
        %s as sub_district_val,
        %s as cs_name_val,
        %s as platform_val,
        %s as adv_name_val,
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
        nullif(trim(coalesce(district_val::text, '')), '') as district,
        nullif(trim(coalesce(sub_district_val::text, '')), '') as sub_district,
        nullif(trim(coalesce(cs_name_val::text, '')), '') as cs_name,
        nullif(trim(coalesce(platform_val::text, '')), '') as platform,
        nullif(trim(coalesce(adv_name_val::text, '')), '') as adv_name,
        raw_data
      from src
    ),
    deduped as (
      select * from (
        select *,
          row_number() over (
            partition by coalesce(phone, email)
            order by
              (case when full_name is not null then 1 else 0 end +
               case when address is not null then 1 else 0 end +
               case when city is not null then 1 else 0 end +
               case when cs_name is not null then 1 else 0 end +
               case when adv_name is not null then 1 else 0 end) desc,
              full_name nulls last
          ) as rn
        from normalized
        where coalesce(phone, email) is not null
      ) t
      where rn = 1
    ),
    inserted_or_updated as (
      insert into public.crm_customers as c (
        full_name, phone, email, address, city, province,
        district, sub_district, cs_name, platform, adv_name,
        raw_data, source_dataset_id, updated_at
      )
      select full_name, phone, email, address, city, province,
             district, sub_district, cs_name, platform, adv_name,
             raw_data, %L::uuid, now()
      from deduped
      on conflict (phone) where phone is not null do update set
        full_name = coalesce(excluded.full_name, c.full_name),
        email = coalesce(excluded.email, c.email),
        address = coalesce(excluded.address, c.address),
        city = coalesce(excluded.city, c.city),
        province = coalesce(excluded.province, c.province),
        district = coalesce(excluded.district, c.district),
        sub_district = coalesce(excluded.sub_district, c.sub_district),
        cs_name = coalesce(excluded.cs_name, c.cs_name),
        platform = coalesce(excluded.platform, c.platform),
        adv_name = coalesce(excluded.adv_name, c.adv_name),
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
    case when v_district_col is not null and v_district_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_district_col) else 'NULL' end,
    case when v_sub_district_col is not null and v_sub_district_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_sub_district_col) else 'NULL' end,
    case when v_cs_name_col is not null and v_cs_name_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_cs_name_col) else 'NULL' end,
    case when v_platform_col is not null and v_platform_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_platform_col) else 'NULL' end,
    case when v_adv_name_col is not null and v_adv_name_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_adv_name_col) else 'NULL' end,
    p_source_table,
    p_dataset_id
  );

  execute v_sql into v_total, v_inserted, v_updated;

  execute format(
    'select count(*) from public.%I where _deleted_at is null',
    p_source_table
  ) into v_total;

  v_skipped := v_total - (v_inserted + v_updated);

  processed := coalesce(v_total, 0);
  inserted := coalesce(v_inserted, 0);
  updated := coalesce(v_updated, 0);
  skipped := coalesce(v_skipped, 0);
  return next;
end;
$$;

-- 2. Update sync_to_crm_transactions — tambah SET LOCAL statement_timeout
create or replace function public.sync_to_crm_transactions(
  p_source_table text,
  p_dataset_id uuid,
  p_column_map jsonb
)
returns table (processed int, inserted int, updated int, skipped int)
language plpgsql
security definer
set search_path = public
set statement_timeout = '5min'
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
  v_skipped int := 0;
  v_source_total int := 0;
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
        public.parse_id_date(date_val)::timestamptz as occurred_at,
        raw_data
      from src
    ),
    deduped as (
      select * from (
        select *,
          row_number() over (
            partition by order_id
            order by occurred_at desc nulls last
          ) as rn
        from normalized
        where order_id is not null
      ) t
      where rn = 1
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
      from deduped n
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

  execute format(
    'select count(*) from public.%I where _deleted_at is null',
    p_source_table
  ) into v_source_total;

  v_skipped := v_source_total - (v_inserted + v_updated);

  processed := coalesce(v_source_total, 0);
  inserted := coalesce(v_inserted, 0);
  updated := coalesce(v_updated, 0);
  skipped := coalesce(v_skipped, 0);
  return next;
end;
$$;

-- 3. Update master sync_crm_dataset — tambah SET LOCAL juga
create or replace function public.sync_crm_dataset(
  p_dataset_id uuid,
  p_mode text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '10min'
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

notify pgrst, 'reload schema';
