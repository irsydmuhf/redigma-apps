-- =====================================================================
-- Cleanup import_jobs yang stuck di status 'queued' > 5 menit
-- =====================================================================
-- Job stuck biasanya karena Edge Function belum di-deploy atau crash.
-- Tandai sebagai 'failed' supaya tidak mengganggu UI.
-- =====================================================================

-- 1. Lihat dulu job mana yang akan di-cleanup
select id, file_name, status, total_rows, created_at,
  extract(epoch from (now() - created_at))/60 as minutes_stuck
from public.import_jobs
where status in ('queued', 'processing')
  and created_at < now() - interval '5 minutes'
order by created_at;

-- 2. Tandai sebagai failed
update public.import_jobs
set
  status = 'failed',
  error_summary = jsonb_build_object(
    'error', 'Stuck — Edge Function tidak respon. Cek deployment process-import.'
  ),
  completed_at = now()
where status in ('queued', 'processing')
  and created_at < now() - interval '5 minutes';

-- 3. Verifikasi
select id, status, error_summary->>'error' as error_msg
from public.import_jobs
where status = 'failed'
order by completed_at desc
limit 10;
