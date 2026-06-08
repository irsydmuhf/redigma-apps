# 🌅 Selamat Pagi! — Ringkasan Pekerjaan Semalam

## Apa yang dikerjain

Sistem **Alias** untuk matching nama orang di Excel ke akun karyawan.
Tujuannya: transaksi Excel (yang nama orangnya ditulis macam-macam:
`Cs.Budi`, `Budi CS`, `Budi`) otomatis nyambung ke akun pemiliknya.

---

## ✅ Yang sudah jadi (12 task)

### 📦 Database (3 migration baru)

1. **`0031_user_role_aliases.sql`** — tabel master peran + tabel alias + RLS
2. **`0032_crm_transactions_user_ids.sql`** — tambah 5 kolom user_id di transaksi
3. **`0033_alias_link_functions.sql`** — 5 fungsi otomatis (relink, get_unlinked, dll)

### 🖥️ Halaman baru

1. **`/admin/users/[id]`** — Halaman Edit User: lihat & ubah alias, plus tombol nonaktifkan dengan transfer
2. **`/admin/setup-alias`** — Bulk Setup Wizard (1x untuk migrasi data lama)
3. **`/admin/setup-alias/[role]`** — wizard mapping detail per peran
4. **`/admin/crm-sync/perlu-ditinjau`** — Inbox: nama Excel yg belum ke-link
5. **`/admin/role-columns`** — Kelola peran (aktifkan CRM/Live/Content)

### 🔧 Halaman yang di-upgrade

- **`/admin/users/baru`** — section "Nama di Excel" per peran + tombol Pilih dari Data
- **`/admin/users`** — tombol Edit di tiap baris
- **`/pengaturan`** — staff bisa lihat aliasnya sendiri (read-only)
- **Sidebar** — tambah 3 menu baru: Inbox Tinjau, Setup Alias, Kelola Peran

### ✅ Validasi

- **typecheck** ✅ pass
- **build** ✅ pass (22 routes, semua jalan)

---

## 📋 Langkah pertama yang harus Anda lakukan

### 1. Apply 3 migration di Supabase

Buka https://app.supabase.com → SQL Editor → jalankan urutan:

```
supabase/migrations/0031_user_role_aliases.sql
supabase/migrations/0032_crm_transactions_user_ids.sql
supabase/migrations/0033_alias_link_functions.sql
```

⚠️ **Penting**: jalankan satu-per-satu, urut. Cek nggak ada error di Output.

### 2. Restart `pnpm dev`

```powershell
cd C:\Users\allam\.claude\projects\database-redigma-super-app
pnpm dev
```

### 3. Buka `http://localhost:3000` & login

Login pakai akun Admin: `zahidfauzir7885@gmail.com` / `qwerty`

### 4. Cek menu baru di sidebar

Anda harusnya lihat 3 menu baru: **Inbox Tinjau**, **Setup Alias**, **Kelola Peran**.

### 5. Setup Alias (1x untuk data yg sudah ada)

Klik **Setup Alias** → akan ada ringkasan per peran (CS & Adv aktif). Klik
salah satu → wizard map setiap nama ke akun → klik "Simpan & Re-scan".

Setelah itu, transaksi historis langsung nyambung ke akun pemiliknya.

---

## 🎯 Cara kerja sehari-hari setelah setup

### Upload Excel baru
1. Upload Excel kayak biasa di `/upload`
2. Sync ke CRM lewat `/admin/crm-sync` (atau auto-sync)
3. **Cek Inbox Tinjau** — kalau ada nama baru yg belum dikenal, akan muncul di sini

### Karyawan baru
1. Admin/Head/SPV bikin akun di `/admin/users/baru`
2. Isi alias di form yang sama (tombol **Pilih dari Data** bantu pilih dari Excel)
3. Submit → otomatis nyambung ke transaksi historisnya

### Karyawan resign / pindah divisi
1. Buka **Edit User** → klik **Nonaktifkan**
2. Pilih tanggal nonaktif
3. Pilih pengganti (atau "tanpa pengganti")
4. Submit → history aman, alias transfer ke pengganti mulai tanggal nonaktif

---

## 📖 Dokumentasi lengkap

Lihat `ALIAS_MATCHING.md` di root project untuk detail aturan, hak akses,
struktur database, dan cara apply migration.

---

## ⚠️ Catatan kecil

1. **Peran CRM, Live, Content** masih nonaktif. Aktifkan di `/admin/role-columns`
   kalau Excel sudah punya kolomnya.
2. **Staff & Direksi** tidak bisa edit alias (cuma lihat). Pengaturan keamanan
   sudah enforce lewat RLS + server action.
3. **Smart-normalize**: `Cs.Budi` = `cs.budi` = `CS.BUDI` = `Cs.Budi `. Tapi
   `Cs.Budi` ≠ `Cs_Budi` (titik vs underscore tetap dibedain).
4. **Auto re-link**: setiap kali alias ditambah/dihapus, transaksi yang
   match/lepas otomatis di-update. Tidak perlu trigger manual.

---

## 🐛 Kalau ada error

1. **Migration gagal** → cek error message di Supabase SQL Editor. Biasanya
   karena urutan migration salah, atau ada kolom duplikat.
2. **"Hanya admin yang bisa..."** → login pakai akun admin Zahid.
3. **Inbox kosong tapi ada transaksi unmapped** → migration `0033` belum
   di-apply, atau Excel belum di-sync ke `crm_transactions`.

Selamat ngopi & selamat pagi! ☕
