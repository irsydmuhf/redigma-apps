-- =====================================================================
-- Bersihkan dataset duplikat dari testing Phase 3/4
-- =====================================================================
-- Strategi: lihat dulu, baru hapus yang Anda tidak butuhkan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lihat semua dataset + jumlah baris-nya
-- ---------------------------------------------------------------------
do $$
declare
  v_ds record;
  v_count int;
  v_result text := '';
begin
  for v_ds in
    select id, physical_table_name, display_name, division_code, created_at
    from public.datasets
    order by display_name, created_at
  loop
    execute format('select count(*) from public.%I where _deleted_at is null', v_ds.physical_table_name)
      into v_count;
    raise notice '% | % | % rows | %', v_ds.created_at::date,
      rpad(v_ds.physical_table_name, 50), v_count, v_ds.display_name;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Hapus tabel duplikat — sesuaikan list di bawah
-- ---------------------------------------------------------------------
-- GANTI list 'tabel_yg_mau_dihapus' sesuai output di atas.
-- Pakai trial: jalankan ROLLBACK dulu, kalau yakin baru ganti jadi COMMIT.

do $$
declare
  v_table text;
  v_tables_to_drop text[] := array[
    -- Tambah/hapus baris di sini sesuai kebutuhan:
    'book1_2',
    'book1_3',
    'book1_4',
    'book1_5'
    -- 'report_partner_relasi_summary_lead_gen_data_soscom_tabel_2'
  ];
begin
  foreach v_table in array v_tables_to_drop
  loop
    -- Drop physical table
    execute format('drop table if exists public.%I cascade', v_table);
    -- Hapus metadata dataset (dataset_columns ikut via ON DELETE CASCADE)
    delete from public.datasets where physical_table_name = v_table;
    raise notice 'Dropped: %', v_table;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 3. Verifikasi
-- ---------------------------------------------------------------------
select
  d.physical_table_name,
  d.display_name,
  d.division_code,
  d.created_at::date,
  (select count(*) from information_schema.tables
   where table_schema = 'public'
     and table_name = d.physical_table_name) as table_exists
from public.datasets d
order by d.display_name, d.created_at;
