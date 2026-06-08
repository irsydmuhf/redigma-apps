-- =====================================================================
-- Bersihkan zombie datasets (tabel sudah dibuat tapi data tidak masuk)
-- =====================================================================
-- Cek dulu apa saja zombie-nya, baru jalankan DELETE bagian bawah
-- =====================================================================

-- 1. Lihat dataset yang kemungkinan zombie (cek count rows masing-masing tabel)
select
  d.id,
  d.physical_table_name,
  d.display_name,
  d.created_at
from public.datasets d
order by d.created_at desc;

-- 2. Untuk format_invoice spesifik — hapus dataset + tabel-nya
-- Jalankan kalau yakin mau dihapus (sesuaikan nama tabel):

-- DROP tabel dinamisnya (kalau ada)
drop table if exists public.format_invoice cascade;

-- HAPUS metadata dataset + kolom-nya
delete from public.datasets where physical_table_name = 'format_invoice';
-- dataset_columns ikut terhapus karena ON DELETE CASCADE

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

-- 3. Verifikasi sudah bersih
select 'datasets' as t, count(*) from public.datasets where physical_table_name = 'format_invoice'
union all
select 'physical_table_exists' as t, count(*) from information_schema.tables
where table_schema = 'public' and table_name = 'format_invoice';
