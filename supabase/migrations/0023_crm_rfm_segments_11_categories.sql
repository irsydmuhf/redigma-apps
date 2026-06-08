-- =====================================================================
-- Sistem Segmentasi RFM — 11 kategori sesuai spesifikasi Redigma
-- =====================================================================
-- Override function compute_rfm_segment dengan aturan dari business team.
--
-- Skor R: 5=0-15hari, 4=16-30, 3=31-45, 2=46-90, 1=>90 hari
-- Skor F: 5=>=8 tx, 4=6-7, 3=4-5, 2=2-3, 1=1 tx
-- Skor M: 5=>=1.2jt, 4=700k-1.2jt, 3=300-700k, 2=100-300k, 1=<100k
--
-- Priority order (yang match pertama menang):
--   1. Champions          R=5, F>=4, M>=4
--   2. Loyal Customers    R=3-4, F>=4, M>=3
--   3. Potential Loyalists R=4-5, F=2-3, M=2-3
--   4. Big Spenders       R=3-5, F=1-3, M=4-5
--   5. New Customers      R=4-5, F=1, M=1-3
--   6. At Risk            R=1-2, F=1-5, M=3-5
--   7. Need Attention     R=3, F=2-3, M=2-3
--   8. About To Sleep     R=2, F=2-3, M=2-3
--   9. Hibernating        R=2-3, F=1, M=1-3
--   10. Lost Customers    R=1, M=1-3
--   11. Others            (catch-all)
-- =====================================================================

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
begin
  -- ========== Skor RECENCY (R) ==========
  -- Customer tanpa pembelian = R=1 (Lost candidate)
  r := case
    when p_days_since_last is null then 1
    when p_days_since_last <= 15 then 5   -- 0-15 hari
    when p_days_since_last <= 30 then 4   -- 16-30 hari
    when p_days_since_last <= 45 then 3   -- 31-45 hari
    when p_days_since_last <= 90 then 2   -- 46-90 hari
    else 1                                 -- >90 hari
  end;

  -- ========== Skor FREQUENCY (F) ==========
  f := case
    when p_total_orders >= 8 then 5       -- 8+ tx
    when p_total_orders >= 6 then 4       -- 6-7 tx
    when p_total_orders >= 4 then 3       -- 4-5 tx
    when p_total_orders >= 2 then 2       -- 2-3 tx
    else 1                                 -- 1 tx
  end;

  -- ========== Skor MONETARY (M) ==========
  m := case
    when p_total_spent >= 1200000 then 5  -- >= 1.2jt
    when p_total_spent >= 700000 then 4   -- 700k-1.2jt
    when p_total_spent >= 300000 then 3   -- 300-700k
    when p_total_spent >= 100000 then 2   -- 100-300k
    else 1                                 -- <100k
  end;

  -- ========== SEGMENTASI (priority match — first wins) ==========
  segment := case
    -- 1. Champions: R=5, F>=4, M>=4
    when r = 5 and f >= 4 and m >= 4 then 'Champions'

    -- 2. Loyal Customers: R=3-4, F>=4, M>=3
    when r in (3, 4) and f >= 4 and m >= 3 then 'Loyal Customers'

    -- 3. Potential Loyalists: R=4-5, F=2-3, M=2-3
    when r in (4, 5) and f in (2, 3) and m in (2, 3) then 'Potential Loyalists'

    -- 4. Big Spenders: R=3-5, F=1-3, M=4-5
    when r in (3, 4, 5) and f in (1, 2, 3) and m in (4, 5) then 'Big Spenders'

    -- 5. New Customers: R=4-5, F=1, M=1-3
    when r in (4, 5) and f = 1 and m in (1, 2, 3) then 'New Customers'

    -- 6. At Risk: R=1-2, F=1-5, M=3-5
    when r in (1, 2) and f between 1 and 5 and m in (3, 4, 5) then 'At Risk'

    -- 7. Need Attention: R=3, F=2-3, M=2-3
    when r = 3 and f in (2, 3) and m in (2, 3) then 'Need Attention'

    -- 8. About To Sleep: R=2, F=2-3, M=2-3
    when r = 2 and f in (2, 3) and m in (2, 3) then 'About to Sleep'

    -- 9. Hibernating: R=2-3, F=1, M=1-3
    when r in (2, 3) and f = 1 and m in (1, 2, 3) then 'Hibernating'

    -- 10. Lost Customers: R=1, M=1-3
    when r = 1 and m in (1, 2, 3) then 'Lost Customers'

    -- 11. Others: catch-all
    else 'Others'
  end;

  recency := r;
  frequency := f;
  monetary := m;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- Re-run aggregates untuk SEMUA customer existing
-- supaya segment_rfm di-update sesuai aturan baru
-- ---------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  v_count := public.recalculate_all_customer_aggregates();
  raise notice 'Re-segmented % customer dengan aturan RFM baru (11 kategori)', v_count;
end $$;

-- ---------------------------------------------------------------------
-- Verifikasi: lihat distribusi segment setelah update
-- ---------------------------------------------------------------------
select
  segment_rfm,
  count(*) as jumlah_customer,
  round(avg(total_spent), 0) as avg_omset,
  round(avg(total_orders), 1) as avg_orders
from public.crm_customers
where segment_rfm is not null
group by segment_rfm
order by
  case segment_rfm
    when 'Champions' then 1
    when 'Loyal Customers' then 2
    when 'Potential Loyalists' then 3
    when 'Big Spenders' then 4
    when 'New Customers' then 5
    when 'At Risk' then 6
    when 'Need Attention' then 7
    when 'About to Sleep' then 8
    when 'Hibernating' then 9
    when 'Lost Customers' then 10
    when 'Others' then 11
  end;

notify pgrst, 'reload schema';
