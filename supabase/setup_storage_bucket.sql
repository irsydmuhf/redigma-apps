-- =====================================================================
-- Phase 6: Setup Supabase Storage bucket raw-imports
-- =====================================================================
-- Bucket private (tidak publik). Hanya authenticated user yang bisa
-- upload/read file. Server action pakai service_role untuk operasi
-- internal (pre-signed URL, dll).
-- =====================================================================

-- Bikin bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'raw-imports',
  'raw-imports',
  false, -- private
  10485760, -- 10 MB max per file
  array['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- RLS Policies untuk storage.objects pada bucket raw-imports
-- ---------------------------------------------------------------------

-- Authenticated user bisa upload
drop policy if exists "raw_imports_authenticated_insert" on storage.objects;
create policy "raw_imports_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'raw-imports');

-- Authenticated user bisa baca file di bucket ini
-- (RLS lebih ketat bisa di-add di Phase 9 — saat ini cukup membatasi ke authenticated)
drop policy if exists "raw_imports_authenticated_select" on storage.objects;
create policy "raw_imports_authenticated_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'raw-imports');

-- Admin bisa delete
drop policy if exists "raw_imports_admin_delete" on storage.objects;
create policy "raw_imports_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'raw-imports' and public.is_admin(auth.uid()));

-- Verifikasi
select id, name, public, file_size_limit from storage.buckets where id = 'raw-imports';
