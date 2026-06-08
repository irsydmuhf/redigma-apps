-- =====================================================================
-- Update bucket raw-imports — naikkan max file size dari 10MB ke 100MB
-- =====================================================================
-- Free tier Supabase mendukung file hingga 50MB per upload (chunked).
-- Pro plan up to 5GB. Set ke 100MB untuk safety margin.
-- =====================================================================

update storage.buckets
set file_size_limit = 104857600  -- 100 MB
where id = 'raw-imports';

-- Verifikasi
select id, name, file_size_limit, public
from storage.buckets
where id = 'raw-imports';
