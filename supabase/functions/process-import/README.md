# Edge Function: process-import

Background worker untuk file upload besar (≥5MB). Dipanggil dari Next.js server
action `triggerImport(importJobId)` setelah `import_jobs` row dibuat dengan
status `queued`.

## Apa yang dilakukan

1. Fetch `import_jobs` + `datasets` + `dataset_columns`
2. Download raw file dari Supabase Storage bucket `raw-imports`
3. Parse CSV (PapaParse) atau Excel (SheetJS)
4. Coerce nilai per kolom sesuai schema (text/number/date/currency/phone/email/boolean)
5. Compute `_row_hash` kalau ada unique key column
6. Populate `_normalized_phone` / `_normalized_email` / dll dari kolom convention
7. Insert batch (1000 rows/batch) via RPC `insert_dynamic_rows` atau
   `insert_dynamic_rows_with_dedup` (sesuai mode)
8. Update `import_jobs.rows_inserted` setiap 5 batch
9. Mark `status='done'` saat selesai, `'failed'` kalau error

## Cara Deploy

### Opsi A — via Supabase CLI (recommended)

```bash
# Install CLI sekali saja
npm install -g supabase

# Login ke akun Supabase
supabase login

# Link project
supabase link --project-ref <staging-ref>

# Deploy function
supabase functions deploy process-import --project-ref <staging-ref>
```

Setelah deploy, function tersedia di:
`https://<staging-ref>.supabase.co/functions/v1/process-import`

### Opsi B — via Dashboard

1. Buka **Supabase Dashboard > Edge Functions > New function**
2. Nama: `process-import`
3. Copy isi `index.ts` ke editor
4. Copy isi `coerce.ts` ke file terpisah `coerce.ts`
5. **Deploy**

> Note: opsi B mungkin tidak otomatis include `coerce.ts`. CLI lebih aman.

## Environment Variables

Edge function pakai env vars yang **otomatis di-set** oleh Supabase:
- `SUPABASE_URL` — URL project Anda
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (untuk bypass RLS)

Tidak perlu setup manual.

## Cara Test

Setelah deploy:

```bash
curl -X POST \
  https://<your-ref>.supabase.co/functions/v1/process-import \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"importJobId": "uuid-of-job-with-queued-status"}'
```

Atau cukup upload file ≥5MB via halaman `/upload` di app — server action
`triggerImport` akan otomatis invoke function.

## Limit Free Tier

- Timeout per invocation: 150 detik
- File besar (>100k baris) mungkin perlu split atau upgrade ke Pro plan
- Memory limit: 256 MB

## Troubleshooting

**"Job not found"** — pastikan `importJobId` valid dan row sudah ter-insert.

**"Failed to download"** — cek bucket `raw-imports` sudah dibuat dan
`source_file_url` di import_jobs valid (`tempId/filename.csv`).

**Insert timeout** — file terlalu besar untuk free tier. Split file atau
upgrade plan.

**Tidak ada update progress** — pastikan migration 0008 sudah di-apply
(enable Realtime). Cek juga di Supabase Dashboard > Database > Replication,
tabel `import_jobs` ada di publication `supabase_realtime`.
