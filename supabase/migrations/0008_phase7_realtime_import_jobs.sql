-- =====================================================================
-- Phase 7: Enable Realtime untuk import_jobs
-- =====================================================================
-- Setelah ini, client bisa subscribe via @supabase/supabase-js:
--   supabase.channel('jobs').on('postgres_changes',
--     { event: 'UPDATE', schema: 'public', table: 'import_jobs',
--       filter: 'id=eq.{id}' }, callback).subscribe()
-- =====================================================================

-- Tambah import_jobs ke publikasi realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'import_jobs'
  ) then
    alter publication supabase_realtime add table public.import_jobs;
  end if;
end $$;
