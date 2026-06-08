# Deploy ke Production

Panduan deploy aplikasi Database Redigma Super App dari staging ke production.

## Arsitektur

```
                    ┌─────────────────────┐
                    │   app.redigma.com   │
                    │     (Vercel prod)   │
                    └──────────┬──────────┘
                               │
                  ┌────────────┴────────────┐
                  │  redigma-prod (Supabase) │
                  │  - Postgres + RLS        │
                  │  - Auth (magic link)     │
                  │  - Storage raw-imports   │
                  │  - Edge Function         │
                  │  - Realtime publication  │
                  └─────────────────────────┘

                    ┌─────────────────────┐
                    │ staging.redigma.com │
                    │   (Vercel staging)  │
                    └──────────┬──────────┘
                               │
                  ┌────────────┴────────────┐
                  │ redigma-staging (Supabase)│
                  └─────────────────────────┘
```

## Pra-syarat

- Akun GitHub yang punya repo project ini
- Akun Vercel (Pro recommended untuk env-vars stability)
- Akun Supabase (Pro recommended saat production untuk daily backup + pg_cron)
- Domain `redigma.com` dengan akses DNS

## 1. Setup Supabase Production Project

### 1.1. Bikin project baru

1. Buka [supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**
2. Nama: `redigma-prod`
3. Region: `Southeast Asia (Singapore)` — terdekat ke user Indonesia
4. Database password: simpan di password manager
5. Plan: **Pro** ($25/bulan, recommended)

### 1.2. Apply semua migrations (urutan penting)

Buka **SQL Editor** dan run satu per satu:

```
supabase/migrations/0001_phase2_users_divisions.sql
supabase/migrations/0002_phase3_datasets.sql
supabase/migrations/0003_phase3_schema_cache_reload.sql
supabase/migrations/0004_phase3_fix_policy_names.sql
supabase/migrations/0005_phase4_normalized_columns.sql
supabase/migrations/0006_phase5_schema_drift.sql
supabase/migrations/0007_phase6_dedup_import_jobs.sql
supabase/migrations/0008_phase7_realtime_import_jobs.sql
supabase/migrations/0009_phase8_audit_rollback.sql
supabase/migrations/0010_phase9_rbac_hardening.sql
supabase/migrations/0011_phase10_cleanup_job.sql
```

### 1.3. Setup Storage bucket

Run `supabase/setup_storage_bucket.sql` di SQL Editor.

### 1.4. Konfigurasi Auth

- **Authentication > URL Configuration**
  - Site URL: `https://app.redigma.com`
  - Redirect URLs: tambah `https://app.redigma.com/auth/callback`
- **Authentication > Providers > Email**
  - Enable Email provider
  - **Disable** Confirm email (atau enable kalau Anda mau pakai magic link only)
- **Authentication > Rate Limits**
  - Naikkan magic link rate limit kalau perlu (Pro plan ngasih lebih tinggi)

### 1.5. Deploy Edge Function

```bash
# Install Supabase CLI sekali saja
npm install -g supabase

# Login
supabase login

# Link ke project production
supabase link --project-ref <prod-ref>

# Deploy edge function
supabase functions deploy process-import --project-ref <prod-ref>
```

### 1.6. Enable pg_cron (Pro plan)

- **Database > Extensions > pg_cron > Enable**
- Re-run migration 0011 — akan otomatis schedule cleanup job

### 1.7. Bootstrap admin pertama (Anda)

1. Daftarkan email Anda via **Authentication > Users > Add user**
2. Edit `supabase/bootstrap_admin.sql`, ganti email
3. Run di SQL Editor

## 2. Setup Vercel Production

### 2.1. Import project dari GitHub

1. [vercel.com/new](https://vercel.com/new) → Import Git Repository
2. Pilih repo `database-redigma-super-app`
3. **Framework Preset**: Next.js (auto-detected)
4. **Build settings**: default

### 2.2. Environment Variables

Set untuk environment **Production**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<prod-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | _dari Dashboard > Settings > API > anon public_ |
| `SUPABASE_SERVICE_ROLE_KEY` | _dari Dashboard > Settings > API > service_role secret_ |
| `NEXT_PUBLIC_APP_URL` | `https://app.redigma.com` |

**PENTING:** `SUPABASE_SERVICE_ROLE_KEY` jangan pakai prefix `NEXT_PUBLIC_`.

### 2.3. Domain

- **Settings > Domains** → add `app.redigma.com`
- Update DNS di registrar: CNAME `app` → `cname.vercel-dns.com`

### 2.4. Deploy

- Push ke branch `main` → auto-deploy
- Atau klik **Deploy** di Vercel Dashboard

## 3. Setup Staging (sama persis tapi ke project staging)

Ulangi 2.1-2.4 dengan:
- Branch: `develop`
- Domain: `staging.redigma.com`
- Env vars: pakai staging Supabase ref + keys

## 4. Verifikasi Post-Deploy

### 4.1. Smoke test

- [ ] Buka `https://app.redigma.com/login`
- [ ] Login dengan email admin yang sudah didaftarkan
- [ ] Lihat dashboard — divisi switcher muncul, status sistem OK
- [ ] Buka `/admin/users` — bisa lihat user list
- [ ] Upload CSV kecil test → buat dataset baru → cek bisa SELECT
- [ ] Login sebagai user staff (test account) → tidak bisa lihat divisi lain (verifikasi RLS)

### 4.2. Verifikasi RLS

Run `supabase/verify_rls_matrix.sql` di SQL Editor production:
- Semua tabel utama RLS = enabled
- Setiap dynamic table punya 4 policies
- Akses level per user-dataset sesuai matriks

### 4.3. Smoke test Edge Function

Upload file >5MB → cek di `/datasets/{id}?job=...` progress card live update.

### 4.4. Cek Realtime

Buka 2 tab pada halaman dataset detail dengan job processing. Update di salah satu tab harus terlihat di tab lain.

## 5. Data Migration Sprint (Minggu 9-10)

Setelah aplikasi production live & verified:

1. Tim Data IT + perwakilan divisi gather untuk backload wave 1
2. Setiap upload: **centang "Data historis (backfill)"** di toolbar
3. Update [`LEGACY_DATA_ARCHIVE.md`](./LEGACY_DATA_ARCHIVE.md) per upload
4. Verifikasi data masuk di `/datasets`

## 6. Soft Launch (Minggu 11)

Pilot divisi:
- **CS** — SPV CS + 2 staff
- **Finance** — Head Finance + 1 accounting

Training session 1 jam: demo upload, smart match, rollback, table viewer.

## 7. Full Rollout (Minggu 12+)

Onboard divisi lain bertahap. Monitor:
- Error rate di Vercel Analytics
- Slow queries di Supabase Dashboard > Database > Query Performance
- Storage usage (raw-imports bucket size)
- Audit log untuk aktivitas anomali

## 8. Rollback Plan

Kalau ada bug fatal:

1. **Frontend bug** — Vercel: Settings > Deployments → klik build sebelumnya → **Promote to Production**
2. **Database corruption** — Supabase: Database > Backups → restore Point-in-Time (Pro plan)
3. **Edge function bug** — `supabase functions deploy process-import` dengan kode versi sebelumnya

## Maintenance

- **Mingguan**: cek log error Vercel + Supabase, cek storage usage
- **Bulanan**: review audit log, ekspor laporan ke stakeholder
- **Quarterly**: review user list, deaktifkan user resign
- **Yearly**: review LEGACY_DATA_ARCHIVE.md, archive spreadsheet lama
