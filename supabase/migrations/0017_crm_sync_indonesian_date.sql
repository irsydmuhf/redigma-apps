-- =====================================================================
-- Fix: parse tanggal format Indonesia ("31 Des 2025", "1 Januari 2026", dll)
-- =====================================================================
-- Postgres tidak mengenal nama bulan Indonesia (Des, Mei, Agu, Okt).
-- Bikin helper function parse_id_date yang handle multi-format:
-- - "31 Des 2025", "1 Januari 2026" (Indonesia singkat + lengkap)
-- - "31 Dec 2025", "1 January 2026" (English)
-- - "2025-12-31" (ISO)
-- - "31/12/2025", "31-12-2025" (DD/MM/YYYY)
-- =====================================================================

create or replace function public.parse_id_date(s text)
returns date
language plpgsql
immutable
as $$
declare
  v_clean text;
  m text[];
  v_day int;
  v_month_str text;
  v_year int;
  v_month_num int;
begin
  if s is null then return null; end if;
  v_clean := trim(s);
  if v_clean = '' then return null; end if;

  -- 1. Coba ISO format dulu (paling umum)
  begin
    return v_clean::date;
  exception when others then
    null;
  end;

  -- 2. DD Bulan YYYY (Indonesia + English)
  -- Contoh: "31 Des 2025", "1 Januari 2026", "31 Dec 2025"
  m := regexp_matches(v_clean, '^(\d{1,2})[\s\-]+([A-Za-z]+)[\s\-]+(\d{4})$');
  if m is not null then
    v_day := m[1]::int;
    v_month_str := lower(m[2]);
    v_year := m[3]::int;

    v_month_num := case substring(v_month_str from 1 for 3)
      when 'jan' then 1
      when 'feb' then 2
      when 'mar' then 3   -- Maret / March
      when 'apr' then 4
      when 'mei' then 5   -- Mei (Indonesia)
      when 'may' then 5   -- May (English)
      when 'jun' then 6
      when 'jul' then 7
      when 'agu' then 8   -- Agustus
      when 'aug' then 8   -- August
      when 'sep' then 9
      when 'okt' then 10  -- Oktober (Indonesia)
      when 'oct' then 10  -- October (English)
      when 'nov' then 11
      when 'des' then 12  -- Desember (Indonesia)
      when 'dec' then 12  -- December (English)
      else null
    end;

    if v_month_num is not null then
      begin
        return make_date(v_year, v_month_num, v_day);
      exception when others then
        return null;
      end;
    end if;
  end if;

  -- 3. DD/MM/YYYY atau DD-MM-YYYY (Indonesia default)
  m := regexp_matches(v_clean, '^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$');
  if m is not null then
    begin
      return make_date(m[3]::int, m[2]::int, m[1]::int);
    exception when others then
      return null;
    end;
  end if;

  -- 4. YYYY/MM/DD
  m := regexp_matches(v_clean, '^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$');
  if m is not null then
    begin
      return make_date(m[1]::int, m[2]::int, m[3]::int);
    exception when others then
      return null;
    end;
  end if;

  return null;
end;
$$;

-- =====================================================================
-- Update sync_to_crm_transactions — pakai parse_id_date
-- =====================================================================
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
        -- Pakai parse_id_date untuk handle "31 Des 2025" dll
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

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Test parser (run di SQL Editor untuk verifikasi)
-- ---------------------------------------------------------------------
-- select
--   public.parse_id_date('31 Des 2025') as test1,
--   public.parse_id_date('1 Januari 2026') as test2,
--   public.parse_id_date('15 Agu 2025') as test3,
--   public.parse_id_date('2025-12-31') as test4,
--   public.parse_id_date('31/12/2025') as test5,
--   public.parse_id_date('5 Okt 2025') as test6;
