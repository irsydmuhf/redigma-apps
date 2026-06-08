-- =====================================================================
-- Diagnostic: lihat semua dataset + import jobs yang stuck
-- =====================================================================

-- 1. Lihat SEMUA datasets di database (bypass RLS — pakai service role)
select
  d.id,
  d.physical_table_name,
  d.display_name,
  d.division_code,
  d.created_at,
  up.email as created_by_email
from public.datasets d
left join public.user_profiles up on up.id = d.created_by
order by d.created_at desc;

-- 2. Lihat SEMUA import_jobs + status
select
  j.id as job_id,
  j.status,
  j.mode,
  j.file_name,
  j.total_rows,
  j.rows_inserted,
  j.created_at,
  j.completed_at,
  case
    when j.status = 'queued' and j.created_at < now() - interval '5 minutes'
      then 'STUCK ⚠'
    else 'OK'
  end as health,
  d.display_name as dataset,
  d.physical_table_name as table_name
from public.import_jobs j
left join public.datasets d on d.id = j.dataset_id
order by j.created_at desc;

-- 3. Cek apakah ada dataset orphan (tidak punya import_jobs)
select
  d.display_name,
  d.physical_table_name,
  d.created_at,
  count(j.id) as job_count
from public.datasets d
left join public.import_jobs j on j.dataset_id = d.id
group by d.id, d.display_name, d.physical_table_name, d.created_at
order by d.created_at desc;
