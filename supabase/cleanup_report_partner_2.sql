-- Cleanup zombie tabel `report_partner_..._2` dari upload gagal
drop table if exists public.report_partner_relasi_summary_lead_gen_data_soscom_tabel_2 cascade;

delete from public.datasets
where physical_table_name = 'report_partner_relasi_summary_lead_gen_data_soscom_tabel_2';

notify pgrst, 'reload schema';

-- Verifikasi
select 'datasets' as t, count(*) from public.datasets
where physical_table_name like 'report_partner_relasi_summary_lead_gen_data_soscom_tabel%'
union all
select 'tables', count(*) from information_schema.tables
where table_schema = 'public'
  and table_name like 'report_partner_relasi_summary_lead_gen_data_soscom_tabel%';
