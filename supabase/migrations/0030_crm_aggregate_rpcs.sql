-- =====================================================================
-- Mesin agregator untuk dashboard CRM
-- =====================================================================
-- Masalah: Supabase PostgREST default cap 1000 rows per request.
-- CRM dashboard fetch SEMUA crm_customers / crm_transactions lalu agregat
-- di JS → cuma dapat 1000 baris → angka salah.
--
-- Solusi: bikin RPC yang agregat di Postgres, return cuma hasil akhir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. get_segment_distribution — count customer per segment
-- ---------------------------------------------------------------------
create or replace function public.get_segment_distribution()
returns table (segment text, count bigint)
language sql
security definer
set search_path = public
set statement_timeout = '1min'
as $$
  select
    segment_rfm as segment,
    count(*) as count
  from public.crm_customers
  where segment_rfm is not null
  group by segment_rfm
  order by count desc;
$$;

grant execute on function public.get_segment_distribution() to authenticated;

-- ---------------------------------------------------------------------
-- 2. get_omset_by_month — total omset per bulan (untuk chart trend)
-- ---------------------------------------------------------------------
create or replace function public.get_omset_by_month(
  p_months int default 12,
  p_date_from date default null,
  p_date_to date default null
)
returns table (month text, total numeric)
language sql
security definer
set search_path = public
set statement_timeout = '1min'
as $$
  with cutoff as (
    select
      coalesce(p_date_from, (current_date - (p_months || ' months')::interval)::date) as start_date,
      coalesce(p_date_to, current_date) as end_date
  )
  select
    to_char(date_trunc('month', occurred_at), 'YYYY-MM') as month,
    sum(amount) as total
  from public.crm_transactions, cutoff
  where occurred_at is not null
    and amount is not null
    and occurred_at::date >= cutoff.start_date
    and occurred_at::date <= cutoff.end_date
  group by 1
  order by 1;
$$;

grant execute on function public.get_omset_by_month(int, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. get_current_month_omset — total bulan ini + bulan lalu
-- ---------------------------------------------------------------------
create or replace function public.get_current_month_omset()
returns table (current_total numeric, prev_total numeric)
language sql
security definer
set search_path = public
set statement_timeout = '1min'
as $$
  select
    coalesce(sum(amount) filter (
      where occurred_at::date >= date_trunc('month', current_date)::date
    ), 0) as current_total,
    coalesce(sum(amount) filter (
      where occurred_at::date >= date_trunc('month', current_date - interval '1 month')::date
        and occurred_at::date < date_trunc('month', current_date)::date
    ), 0) as prev_total
  from public.crm_transactions
  where occurred_at is not null
    and amount is not null
    and occurred_at::date >= date_trunc('month', current_date - interval '1 month')::date;
$$;

grant execute on function public.get_current_month_omset() to authenticated;

notify pgrst, 'reload schema';
