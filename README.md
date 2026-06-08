# Database Redigma Super App

Aplikasi konsolidasi data CSV ke Supabase untuk Redigma.

## Tech Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Supabase (Auth + Postgres + Storage + Realtime)
- pnpm
- Vercel hosting

## Setup Lokal

### 1. Install dependencies

```bash
pnpm install
```

### 2. Setup Supabase Project

Buka [supabase.com](https://supabase.com) dan buat 2 project:

- `redigma-staging` — untuk development & testing
- `redigma-prod` — untuk production (buat nanti saat siap launch)

Untuk development lokal, pakai project **staging**.

### 3. Konfigurasi Environment

Copy `.env.local.example` ke `.env.local` lalu isi nilainya:

```bash
cp .env.local.example .env.local
```

Dari Supabase Dashboard staging > Settings > API, ambil:

- `Project URL` → isi ke `NEXT_PUBLIC_SUPABASE_URL`
- `anon public key` → isi ke `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role secret key` → isi ke `SUPABASE_SERVICE_ROLE_KEY`

> Penting: `SUPABASE_SERVICE_ROLE_KEY` tidak boleh memiliki prefix
> `NEXT_PUBLIC_`. Key ini hanya boleh dipakai di server-side code.

### 4. Konfigurasi Auth Redirect URL di Supabase

Di Supabase Dashboard > Authentication > URL Configuration, tambahkan:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

### 5. Daftarkan User Awal

Di Supabase Dashboard > Authentication > Users > Add user > Create new user.
Self-register dinonaktifkan (`shouldCreateUser: false`), jadi hanya user yang
sudah didaftarkan admin yang bisa login.

### 6. Apply Database Migration (Phase 2+)

Sebelum jalankan aplikasi, apply schema database.

**Opsi A — via Supabase Dashboard (paling mudah):**

1. Buka Supabase Dashboard staging > SQL Editor > New query
2. Copy seluruh isi `supabase/migrations/0001_phase2_users_divisions.sql`, paste, lalu **Run**
3. Verifikasi: Dashboard > Table Editor harus muncul tabel `divisions`,
   `user_profiles`, `user_divisions`

**Opsi B — via Supabase CLI:**

```bash
pnpm dlx supabase link --project-ref <staging-ref>
pnpm dlx supabase db push
```

### 7. Bootstrap Admin Pertama

Setelah migration ter-apply, buat akun admin pertama (Data IT).

1. Di Supabase Dashboard > Authentication > Users > **Add user**, register
   email Anda (misal `admin@redigma.com`) dengan **Auto Confirm User** ON
2. Buka `supabase/bootstrap_admin.sql`, ganti `admin@redigma.com` dengan
   email yang baru Anda daftarkan
3. Jalankan SQL tersebut di Supabase SQL Editor
4. Anda sekarang punya role `admin` di divisi `data_it`

### 8. Jalankan Development Server

```bash
pnpm dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Cara Pakai

1. Buka `/login`, masukkan email yang sudah terdaftar
2. Cek email untuk link login, klik link → masuk ke `/dashboard`
3. Sebagai Admin (Data IT), buka **Admin User** di sidebar
   - Klik **User Baru** untuk membuat akun karyawan baru
   - Assign 1 atau lebih divisi + role per assignment
   - Karyawan otomatis bisa login lewat magic link
4. User dengan >1 divisi melihat **divisi switcher** di header — bisa
   ganti divisi aktif kapan saja
5. Tombol **Keluar** di kanan atas untuk logout

## Struktur Folder

```
app/
  (auth)/login            -- halaman login + magic link
  (auth)/cek-email        -- konfirmasi setelah kirim link
  (app)/dashboard         -- halaman utama setelah login (protected)
  auth/callback           -- handle magic link callback
  auth/sign-out           -- logout
lib/
  supabase/
    client.ts             -- browser client (anon key)
    server.ts             -- server client untuk RSC + Server Actions
    middleware.ts         -- session refresh + route guard
  utils.ts                -- helper cn() untuk shadcn
components/
  ui/                     -- shadcn components
  layout/                 -- AppHeader dll
middleware.ts             -- entry middleware Next.js
```

## Validasi

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Status

**Phase 1 — Foundation & Auth** selesai.
**Phase 2 — User model, divisi, admin pre-create** selesai.
**Phase 3 — CSV upload → dynamic table (tracer bullet)** selesai.
**Phase 4 — Rich schema editor & cleaning preview** selesai.
**Phase 5 — Smart match & schema drift** selesai.
**Phase 6 — Dedup + raw backup + import_jobs** selesai.
**Phase 7 — Edge Function untuk file besar + progress realtime** selesai.
**Phase 8 — Riwayat Import + Rollback + Trash + audit_log** selesai.
**Phase 9 — RBAC hardening + Direksi read-only** selesai.
**Phase 10 — Polish, export, cleanup job, deploy guide** selesai.

🎉 **MVP READY** — semua 10 phase Lean MVP selesai. Lihat
[DEPLOY.md](./DEPLOY.md), [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md),
dan [UAT_CHECKLIST.md](./UAT_CHECKLIST.md) untuk production launch.

User stories yang sudah covered:

- #1 — Admin buat user + assign divisi & role
- #2 — Login lewat magic link
- #3 — Admin nonaktifkan user yang resign
- #4 — Multi-divisi switcher di header
- #5 (parsial) — Auto-detect kolom + tipe (text/number/date/boolean) saat upload
- #9 — Nama dataset bahasa natural → physical_name otomatis ter-normalize
- #23 (parsial) — RLS dasar di datasets & tabel dinamis
- #27 (parsial) — Table viewer (max 200 rows tanpa sort/filter)
- #6 — Preview tabel hasil deteksi dengan cell highlight
- #8 — Toggle kolom unik (untuk dedup di Phase 6)
- #13 — Sel kuning (auto-normalisasi) & merah (error)
- #14 — Edit inline sel error (klik → input)
- #15 — Tombol Lanjutkan disabled saat ada error
- #16 — Bulk "Skip semua baris error"
- #29 — Kolom system hidden di viewer
- Convention badge: kolom no_wa/email/sku/nik otomatis di-normalisasi ke kolom system
- #10 — Smart match suggest "Append ke dataset X" kalau ≥80% kolom cocok
- #11 — Dialog kolom baru: tambah ke tabel / skip
- #12 — Kolom hilang dari CSV: otomatis diisi NULL (info ditampilkan)
- #17 — Raw file backup ke Supabase Storage bucket `raw-imports`
- #18 — File hash check: warning kalau file sama sudah pernah di-upload
- #19 — Dedup mode: Skip / Update / Insert (untuk append flow)
- #20 — Post-import summary card: rows inserted / skipped / updated
- #34 (parsial) — Checkbox "Data historis (backfill)" → simpan ke `import_jobs.is_backfill`
- #21 — File ≥5MB diproses background via Edge Function (boleh tutup tab)
- #22 — Progress bar realtime via Supabase Realtime subscription
- #24 — SPV/Head bisa lihat history upload tim (via RLS division-level)
- #30 — Halaman `/riwayat` lengkap dengan status filter & metadata
- #31 — Tombol Rollback per import (soft delete via RPC)
- #32 — Halaman `/trash` (admin) — Restore & Permanent Delete
- #33 — Tabel `audit_log` mencatat rollback/restore/permanent delete
- #23 — RLS verified: Staff CS tidak bisa SELECT tabel Finance
- #25 — Head of Finance multi-divisi (Finance + Accounting) lewat user_divisions
- #26 — Direksi read-only semua divisi (SELECT only, INSERT/UPDATE/DELETE deny)
- ESLint rule: ban `lib/supabase/admin` import dari `components/`
- #28 — Export CSV dari `/datasets/[id]` (max 5000 rows, hide kolom system)
- #35 — Template `LEGACY_DATA_ARCHIVE.md` untuk track spreadsheet historis
- Cleanup job mingguan via pg_cron — permanent delete soft-deleted >30 hari
- Helper view `raw_files_for_cleanup` — list file Storage >90 hari

## Phase 3 — Cara Pakai

1. **Apply migration 0002**: SQL Editor > paste isi
   `supabase/migrations/0002_phase3_datasets.sql` > Run
2. Pastikan akun Anda punya role `staff`, `spv`, atau `head` di setidaknya
   1 divisi (atau `admin` untuk full access)
3. Klik **Upload CSV** di sidebar atau tombol di Dashboard
4. Pilih file CSV → sistem auto-detect schema → edit nama/tipe kolom kalau
   perlu → Simpan
5. Tabel baru otomatis terbuat di Postgres dengan kolom system + RLS
6. Klik **Dataset** di sidebar untuk melihat semua dataset

Phase berikutnya: Phase 4 — Rich schema editor & cleaning preview
(highlight kuning/merah, edit cell, bulk auto-fix).
