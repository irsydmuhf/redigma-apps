-- =====================================================================
-- Phase 10: Cleanup job + retention helpers
-- =====================================================================
-- 1. Function permanent_delete_old_soft_deleted (cleanup baris soft-deleted >30 hari)
-- 2. Scheduled job via pg_cron (kalau tersedia di project Anda)
-- 3. Helper: list raw files yang siap di-cleanup (>90 hari)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FUNCTION: cleanup_old_soft_deleted
-- ---------------------------------------------------------------------
-- Permanent delete baris yang _deleted_at-nya lebih dari N hari yang lalu.
-- Jalan di SEMUA tabel dinamis (yang ada di datasets).
--
-- Return: jumlah baris yang ter-delete per tabel (jsonb).
-- ---------------------------------------------------------------------
create or replace function public.cleanup_old_soft_deleted(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ds record;
  v_count int;
  v_result jsonb := '{}'::jsonb;
  v_total int := 0;
begin
  for v_ds in select id, physical_table_name from public.datasets
  loop
    execute format(
      'delete from public.%I where _deleted_at is not null and _deleted_at < now() - interval ''%s days''',
      v_ds.physical_table_name, p_days
    );
    get diagnostics v_count = row_count;
    if v_count > 0 then
      v_result := v_result || jsonb_build_object(v_ds.physical_table_name, v_count);
      v_total := v_total + v_count;
    end if;
  end loop;

  -- Audit log
  insert into public.audit_log (user_id, action, target_type, target_id, detail)
  values (
    null, 'cleanup_old_soft_deleted', 'system', null,
    jsonb_build_object(
      'days_threshold', p_days,
      'total_rows_deleted', v_total,
      'per_table', v_result
    )
  );

  return jsonb_build_object('total', v_total, 'per_table', v_result);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Schedule via pg_cron (kalau tersedia)
-- ---------------------------------------------------------------------
-- Supabase by default tidak enable pg_cron di free tier.
-- Untuk Pro plan: enable di Dashboard > Database > Extensions > pg_cron.
--
-- Setelah enable, jalankan:
--   select cron.schedule('cleanup-soft-deleted', '0 2 * * 0',
--     'select public.cleanup_old_soft_deleted(30)');
-- Jalan setiap Minggu jam 02:00.
--
-- Untuk free tier: panggil manual via SQL Editor, atau setup external cron
-- (GitHub Actions / Vercel Cron) yang invoke RPC.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_available_extensions where name = 'pg_cron' and installed_version is not null
  ) then
    perform cron.unschedule('cleanup-soft-deleted')
      where exists (
        select 1 from cron.job where jobname = 'cleanup-soft-deleted'
      );
    perform cron.schedule(
      'cleanup-soft-deleted',
      '0 2 * * 0',  -- Sunday 02:00
      $sql$ select public.cleanup_old_soft_deleted(30) $sql$
    );
    raise notice 'pg_cron job "cleanup-soft-deleted" scheduled.';
  else
    raise notice 'pg_cron belum enable. Function siap di-panggil manual via: select public.cleanup_old_soft_deleted(30);';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Helper: list raw files siap cleanup (>90 hari)
-- ---------------------------------------------------------------------
-- Storage cleanup harus dilakukan via Edge Function atau external script
-- (storage.objects bisa di-query tapi delete-nya better via Storage API).
--
-- Helper ini list path file yang lebih lama dari 90 hari supaya bisa
-- dihapus manual atau via script.
-- ---------------------------------------------------------------------
create or replace view public.raw_files_for_cleanup as
select
  name as path,
  created_at,
  metadata->>'size' as size_bytes,
  metadata->>'mimetype' as mime_type
from storage.objects
where bucket_id = 'raw-imports'
  and created_at < now() - interval '90 days';

comment on view public.raw_files_for_cleanup is
  'Raw CSV/Excel di Storage yang lebih lama dari 90 hari, siap di-cleanup. ' ||
  'Hapus manual via Supabase Dashboard > Storage atau Storage API.';
