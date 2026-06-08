-- =====================================================================
-- CLEANUP: hapus dataset corrupt + CRM data dari dataset itu
-- =====================================================================
-- Jalankan di Supabase SQL Editor, blok per blok kalau timeout.
-- Trigger di-disable sementara supaya DELETE tidak lambat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BLOK 1: Disable trigger sementara supaya delete cepat
-- ---------------------------------------------------------------------
alter table public.crm_transactions disable trigger trg_update_customer_aggregates;

-- ---------------------------------------------------------------------
-- BLOK 2: Hapus tabel mentah corrupt (CASCADE akan ikut hapus
--         metadata di datasets, dataset_columns, import_jobs, mappings)
-- ---------------------------------------------------------------------
drop table if exists public.report_partner_relasi_summary_lead_gen_data_soscom_tabel_3 cascade;

delete from public.datasets
where physical_table_name = 'report_partner_relasi_summary_lead_gen_data_soscom_tabel_3';

-- ---------------------------------------------------------------------
-- BLOK 3: Hapus CRM data — pakai TRUNCATE (super cepat, abaikan trigger)
-- ---------------------------------------------------------------------
truncate public.crm_transactions cascade;
truncate public.crm_customers cascade;
truncate public.crm_segment_snapshots cascade;
truncate public.crm_sync_log;

-- ---------------------------------------------------------------------
-- BLOK 4: Enable trigger lagi
-- ---------------------------------------------------------------------
alter table public.crm_transactions enable trigger trg_update_customer_aggregates;

-- ---------------------------------------------------------------------
-- BLOK 5: Reload schema cache + verifikasi
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

select 'datasets' as t, count(*) from public.datasets
union all
select 'crm_customers', count(*) from public.crm_customers
union all
select 'crm_transactions', count(*) from public.crm_transactions
union all
select 'crm_sync_log', count(*) from public.crm_sync_log;
