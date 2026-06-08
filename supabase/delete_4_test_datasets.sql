-- =====================================================================
-- Hapus 4 dataset test:
--   1. book1
--   2. book1_2
--   3. report_partner_relasi_summary_lead_gen_data_soscom_tabel
--   4. report_partner_relasi_summary_lead_gen_data_soscom_tabel_2
-- =====================================================================
-- Yang dihapus:
-- - Tabel dinamis fisik (DROP TABLE CASCADE — policy ikut terhapus)
-- - Metadata di datasets (CASCADE ke dataset_columns + schema_changelog)
-- - import_jobs row (CASCADE via dataset_id FK)
-- - File raw di Storage TIDAK ikut terhapus (perlu manual di Dashboard)
-- =====================================================================

-- 1. Lihat state sekarang
select physical_table_name, display_name, division_code, created_at
from public.datasets
where physical_table_name in (
  'book1',
  'book1_2',
  'report_partner_relasi_summary_lead_gen_data_soscom_tabel',
  'report_partner_relasi_summary_lead_gen_data_soscom_tabel_2'
)
order by physical_table_name;

-- 2. Drop tabel dinamis
do $$
declare
  v_table text;
  v_tables text[] := array[
    'book1',
    'book1_2',
    'report_partner_relasi_summary_lead_gen_data_soscom_tabel',
    'report_partner_relasi_summary_lead_gen_data_soscom_tabel_2'
  ];
begin
  foreach v_table in array v_tables
  loop
    execute format('drop table if exists public.%I cascade', v_table);
    raise notice 'Dropped table: %', v_table;
  end loop;
end $$;

-- 3. Hapus metadata datasets (dataset_columns + schema_changelog + import_jobs cascade)
delete from public.datasets
where physical_table_name in (
  'book1',
  'book1_2',
  'report_partner_relasi_summary_lead_gen_data_soscom_tabel',
  'report_partner_relasi_summary_lead_gen_data_soscom_tabel_2'
);

-- 4. Reload PostgREST schema cache
notify pgrst, 'reload schema';

-- 5. Verifikasi — harus tidak ada hasil
select 'datasets metadata' as check_type, count(*) as remaining
from public.datasets
where physical_table_name in (
  'book1',
  'book1_2',
  'report_partner_relasi_summary_lead_gen_data_soscom_tabel',
  'report_partner_relasi_summary_lead_gen_data_soscom_tabel_2'
)
union all
select 'physical tables', count(*)
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'book1',
    'book1_2',
    'report_partner_relasi_summary_lead_gen_data_soscom_tabel',
    'report_partner_relasi_summary_lead_gen_data_soscom_tabel_2'
  );
