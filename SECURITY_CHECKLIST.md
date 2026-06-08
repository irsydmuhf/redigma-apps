# Security Checklist

Verifikasi semua item sebelum production launch. Update tanggal kalau diverifikasi ulang.

## Service Role Key Protection

- [x] `SUPABASE_SERVICE_ROLE_KEY` di-prefix tanpa `NEXT_PUBLIC_` (server-side only)
- [x] `lib/supabase/admin.ts` pakai `import "server-only"` — throw error kalau di-import dari client component
- [x] ESLint rule `no-restricted-imports` di `components/` — warn kalau coba import admin client
- [x] Service role key di-rotate kalau ada indikasi bocor (manual via Supabase Dashboard)

**Verifikasi:** `grep -r "SUPABASE_SERVICE_ROLE_KEY" app/ components/ lib/` — hasilnya cuma di `lib/supabase/admin.ts` dan tidak di komponen client.

## SQL Injection Prevention

- [x] Postgres function `create_dynamic_table` validasi physical_name regex `^[a-z][a-z0-9_]{0,62}$`
- [x] Whitelist data_type — error kalau tipe di luar `{text,number,date,boolean,currency,phone,email}`
- [x] Semua DDL pakai `format('%I', ident)` untuk identifier escaping
- [x] User input string tidak pernah di-concat langsung ke SQL
- [x] Function `alter_dynamic_table_add_column` validasi nama kolom sama ketatnya

**Verifikasi:** scan semua `execute format(...)` di file migration — tidak ada yang concat string dengan user input.

## RLS Coverage

- [x] Semua tabel utama RLS enabled:
  - `divisions`, `user_profiles`, `user_divisions`
  - `datasets`, `dataset_columns`
  - `import_jobs`, `schema_changelog`, `audit_log`
- [x] Setiap tabel dinamis dapat 4 policies otomatis dari `create_dynamic_table`:
  - `dataset_select` — SELECT untuk admin/direksi/member divisi (filter soft-deleted)
  - `dataset_insert` — INSERT untuk admin/staff/spv/head divisi
  - `dataset_update` — UPDATE untuk admin/staff/spv/head divisi
  - `dataset_delete` — DELETE untuk admin only
- [x] Direksi explicit deny INSERT/UPDATE/DELETE di semua tabel data

**Verifikasi:** run `supabase/verify_rls_matrix.sql` di SQL Editor → pastikan semua tabel utama RLS = enabled + setiap dynamic table punya 4 policies.

## Authentication

- [x] Magic link sebagai default (passwordless)
- [x] Password fallback untuk development (bisa di-disable di production)
- [x] `shouldCreateUser: false` di magic link config — hanya user terdaftar yang bisa login
- [x] Self-register dihapus (`/register` tidak ada)
- [x] Middleware redirect `/dashboard` → `/login` kalau belum auth
- [x] Magic link rate limiting (Supabase built-in)

**Verifikasi:** coba buka `https://app.redigma.com/register` → 404.

## Storage Bucket

- [x] Bucket `raw-imports` private (`public: false`)
- [x] Max file size 10 MB enforced di bucket config
- [x] MIME types restrictive (csv, xlsx, xls, plain text)
- [x] RLS policy: authenticated user only untuk INSERT/SELECT, admin untuk DELETE
- [x] Retention 90 hari (helper `raw_files_for_cleanup` view di migration 0011)

## Audit Trail

- [x] `audit_log` mencatat:
  - `rollback_import` (siapa, kapan, baris terpengaruh)
  - `restore_import`
  - `permanent_delete_import`
  - `cleanup_old_soft_deleted` (system job)
- [x] `schema_changelog` mencatat:
  - `add_column`
  - `append_data`
- [x] `import_jobs` simpan full metadata setiap upload (file_hash, source_file_url, mode, counts)

**Verifikasi:** lakukan rollback test → cek `audit_log` ada entry baru dengan detail lengkap.

## RBAC Matriks

| Operasi | admin | staff/spv/head (divisi-nya) | direksi | user lain |
|---|---|---|---|---|
| SELECT dataset data | ✓ semua | ✓ divisi-nya | ✓ semua | ✗ |
| INSERT dataset data | ✓ | ✓ divisi-nya | ✗ | ✗ |
| UPDATE dataset data | ✓ | ✓ divisi-nya | ✗ | ✗ |
| DELETE dataset data | ✓ | ✗ (rollback only) | ✗ | ✗ |
| Bikin user baru | ✓ | ✗ | ✗ | ✗ |
| Lihat /admin/users | ✓ | ✗ | ✗ | ✗ |
| Lihat /trash | ✓ | ✗ | ✗ | ✗ |
| Permanent delete | ✓ | ✗ | ✗ | ✗ |
| Rollback import | ✓ | ✓ owner/spv/head | ✗ | ✗ |
| Restore | ✓ | ✓ owner | ✗ | ✗ |

## Environment Separation

- [x] 2 Supabase project terpisah (staging + production)
- [x] 2 Vercel deployment terpisah (staging.redigma.com + app.redigma.com)
- [x] Environment variables beda per Vercel project
- [x] Migration di-apply ke staging dulu, baru ke production
- [x] Staging berisi data dummy/sample, BUKAN copy production

## Network & Transport

- [x] HTTPS only (Vercel default + Supabase default)
- [x] CORS configured implicit oleh Next.js Server Actions (server-side only)
- [x] No public API endpoint (semua via Server Actions atau RLS)

## Open Items (Post-Launch)

- [ ] **Sentry / error monitoring** — set up di Vercel + Supabase
- [ ] **Penetration test** — minimal SQL injection + XSS test setelah launch
- [ ] **Disaster Recovery drill** — test restore dari Supabase backup
- [ ] **2FA untuk admin** — Supabase Auth support, enable untuk role admin
- [ ] **WAF/DDoS protection** — Vercel Pro punya built-in, evaluasi sebelum traffic naik

---

**Terakhir diverifikasi:** _isi tanggal_
**Oleh:** _nama Data IT_
