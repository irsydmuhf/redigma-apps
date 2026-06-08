-- =====================================================================
-- Cleanup tabel dari upload yang gagal di tengah jalan
-- =====================================================================

-- Cek dulu state-nya
select 'dataset_exists' as t, count(*) from public.datasets
where physical_table_name = 'report_partner_relasi_summary_lead_gen_data_soscom_tabel_sheet1'
union all
select 'physical_table_exists', count(*) from information_schema.tables
where table_schema = 'public'
  and table_name = 'report_partner_relasi_summary_lead_gen_data_soscom_tabel_sheet1';

-- Hapus tabel + metadata
drop table if exists public.report_partner_relasi_summary_lead_gen_data_soscom_tabel_sheet1 cascade;

delete from public.datasets
where physical_table_name = 'report_partner_relasi_summary_lead_gen_data_soscom_tabel_sheet1';

notify pgrst, 'reload schema';

-- Verifikasi sudah bersih
select 'dataset_exists' as t, count(*) from public.datasets
where physical_table_name = 'report_partner_relasi_summary_lead_gen_data_soscom_tabel_sheet1'
union all
select 'physical_table_exists', count(*) from information_schema.tables
where table_schema = 'public'
  and table_name = 'report_partner_relasi_summary_lead_gen_data_soscom_tabel_sheet1';
