-- =====================================================================
-- Tambah top_product per customer (produk yang paling banyak dibeli)
-- =====================================================================
-- Sebelumnya kolom 'produk' di view customers di-stub null::text.
-- Sekarang kita materialize: hitung sekali saat sync, simpan di
-- crm_customers.top_product, lalu view expose.
--
-- Alasan materialize (bukan subquery di view):
-- - List customer fetch 100-1000 row sekaligus → subquery per row bisa
--   lambat
-- - Sudah ada infra recalculate_all_customer_aggregates yang jalan sekali
--   per sync — tinggal tambah 1 logic di situ.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add column
-- ---------------------------------------------------------------------
alter table public.crm_customers
  add column if not exists top_product text;

-- ---------------------------------------------------------------------
-- 2. Update recalculate_all_customer_aggregates — hitung top_product
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
  -- Produk paling banyak dibeli per customer
  tx_top_product as (
    select distinct on (customer_id)
      customer_id,
      product_name as top_product
    from (
      select
        customer_id,
        product_name,
        count(*) as cnt
      from public.crm_transactions
      where customer_id is not null
        and product_name is not null
        and product_name <> ''
      group by customer_id, product_name
    ) sub
    order by customer_id, cnt desc, product_name
  ),
  with_rfm as (
    select
      ts.customer_id,
      ts.total_amount,
      ts.total_count,
      ts.last_order,
      tp.top_product,
      (rfm.*)
    from tx_stats ts
    left join tx_top_product tp on tp.customer_id = ts.customer_id
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
    top_product = wr.top_product,
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
-- 3. Recreate view customers — expose top_product sebagai 'produk'
-- ---------------------------------------------------------------------
drop view if exists public.customers cascade;
create view public.customers as
select
  id,
  phone as no_hp,
  full_name as nama,
  total_spent as sum_omset,
  last_purchase_at::text as last_order_date,
  total_orders as total_invoice,
  top_product as produk,
  cs_name as crm_name,
  segment_rfm as rfm_segment,
  updated_at::text as last_updated,
  rfm_recency as r_score,
  rfm_frequency as f_score,
  rfm_monetary as m_score,
  null::int as jumlah_crm,
  null::text as detail_crm,
  assigned_cs_id as assigned_crm_id,
  updated_at::text as synced_at,
  last_contact_at::text as last_contact_at,
  last_action_at::text as last_action_at,
  next_followup_at::text as next_followup_at,
  notes,
  tags,
  status
from public.crm_customers;

grant select on public.customers to authenticated;

-- INSTEAD OF triggers — re-attach karena view di-drop cascade
create or replace function public.customers_view_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.crm_customers set
    phone = coalesce(NEW.no_hp, phone),
    full_name = coalesce(NEW.nama, full_name),
    cs_name = coalesce(NEW.crm_name, cs_name),
    segment_rfm = coalesce(NEW.rfm_segment, segment_rfm),
    assigned_cs_id = NEW.assigned_crm_id,
    notes = NEW.notes,
    tags = NEW.tags,
    status = coalesce(NEW.status, status),
    last_contact_at = coalesce(NEW.last_contact_at::timestamptz, last_contact_at),
    last_action_at = coalesce(NEW.last_action_at::timestamptz, last_action_at),
    next_followup_at = NEW.next_followup_at::timestamptz,
    updated_at = now()
  where id = NEW.id;
  return NEW;
end;
$$;

drop trigger if exists customers_view_update_trigger on public.customers;
create trigger customers_view_update_trigger
  instead of update on public.customers
  for each row execute function public.customers_view_update();

-- ---------------------------------------------------------------------
-- 4. Run sekali untuk populate top_product di customer existing
-- ---------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  v_count := public.recalculate_all_customer_aggregates();
  raise notice 'Recalculated aggregates + top_product untuk % customer', v_count;
end $$;

notify pgrst, 'reload schema';
