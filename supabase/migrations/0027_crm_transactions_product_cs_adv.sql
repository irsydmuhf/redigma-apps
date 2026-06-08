-- =====================================================================
-- Tambah product_name, cs_name, adv_name ke crm_transactions (per-transaksi)
-- =====================================================================
-- Sebelumnya cs_name & adv_name hanya ada di crm_customers (per customer).
-- Tapi di Excel sumber data, kolom-kolom itu per-baris transaksi —
-- jadi 1 customer bisa di-handle CS/Adv berbeda di order berbeda.
--
-- product_name juga belum ada di master sama sekali — tadinya kolom
-- `produk` di view transactions cuma stub null.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add columns
-- ---------------------------------------------------------------------
alter table public.crm_transactions
  add column if not exists product_name text,
  add column if not exists cs_name text,
  add column if not exists adv_name text;

-- ---------------------------------------------------------------------
-- 2. Update RPC sync_to_crm_transactions
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
set statement_timeout = '5min'
set lock_timeout = '5min'
as $$
declare
  v_order_id_col text := p_column_map->>'order_id';
  v_phone_col text := p_column_map->>'phone';
  v_amount_col text := p_column_map->>'amount';
  v_channel_col text := p_column_map->>'channel';
  v_status_col text := p_column_map->>'status';
  v_date_col text := p_column_map->>'occurred_at';
  v_product_col text := p_column_map->>'product_name';
  v_cs_col text := p_column_map->>'cs_name';
  v_adv_col text := p_column_map->>'adv_name';
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
        %s::text as product_val,
        %s::text as cs_val,
        %s::text as adv_val
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
        nullif(trim(coalesce(product_val, '')), '') as product_name,
        nullif(trim(coalesce(cs_val, '')), '') as cs_name,
        nullif(trim(coalesce(adv_val, '')), '') as adv_name
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
        product_name, cs_name, adv_name, source_dataset_id
      )
      select
        (select id from public.crm_customers where phone = n.phone limit 1),
        n.order_id, coalesce(n.amount, 0), n.channel, n.status, n.occurred_at,
        n.product_name, n.cs_name, n.adv_name, %L::uuid
      from deduped n
      on conflict (order_id) where order_id is not null do update set
        amount = excluded.amount,
        status = excluded.status,
        occurred_at = excluded.occurred_at,
        product_name = coalesce(excluded.product_name, t.product_name),
        cs_name = coalesce(excluded.cs_name, t.cs_name),
        adv_name = coalesce(excluded.adv_name, t.adv_name)
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
    case when v_product_col is not null and v_product_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_product_col) else 'NULL' end,
    case when v_cs_col is not null and v_cs_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_cs_col) else 'NULL' end,
    case when v_adv_col is not null and v_adv_col ~ '^[a-z_][a-z0-9_]*$'
         then format('t.%I', v_adv_col) else 'NULL' end,
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

-- ---------------------------------------------------------------------
-- 3. Recreate compat view transactions — expose 3 kolom baru
-- ---------------------------------------------------------------------
drop view if exists public.transactions cascade;
create view public.transactions as
select
  t.id,
  t.order_id as invoice_number,
  t.occurred_at::text as order_date,
  c.phone as no_hp,
  c.full_name as nama_customer,
  t.amount as omset,
  t.product_name as produk,
  t.channel as nama_sistem,
  t.cs_name as nama_cs,
  t.adv_name as adv_name,
  t.created_at::text as synced_at,
  t.customer_id,
  t.source_dataset_id
from public.crm_transactions t
left join public.crm_customers c on c.id = t.customer_id;

grant select on public.transactions to authenticated;

notify pgrst, 'reload schema';
