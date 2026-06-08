# Sistem Alias — Matching Nama Excel → Akun Karyawan

## Apa & Kenapa

Di Redigma, transaksi di file Excel pakai **nama orang** di kolom CS / Advertiser:

```
| Invoice | Nama CS | Nama Adv | Omset    |
|---------|---------|----------|----------|
| INV-001 | Cs.Budi | Adv.Tina | 1.000.000|
```

Tapi nama itu di Excel sering ditulis **macam-macam** — `Cs.Budi`, `Budi CS`, `Budi`. Semuanya orang yg sama!

Sistem ini bikin tiap akun karyawan punya **daftar nama panggilan (alias)** per peran. Saat upload Excel, sistem otomatis cocokin nama di Excel ke alias → transaksi nyambung ke akun pemilik.

**Ibarat KTP**: 1 orang punya banyak nama panggilan, sistem perlu daftarin semua.

---

## Peran yang ada

Saat ini aktif di Excel Redigma:
- **CS** (Customer Service)
- **Advertiser** (Meta / Shopee / TikTok — semua di 1 kolom)

Disiapkan tapi nonaktif (Excel belum punya kolomnya):
- **CRM**
- **Live Host**
- **Content Creator**

Admin Data IT bisa aktifkan/tambah peran lewat **`/admin/role-columns`**.

---

## Aturan utama

1. **Smart-normalize**: `Cs.Budi` = `cs.budi` = `CS.BUDI` = `Cs.Budi ` (spasi rapi, huruf besar/kecil cuek). Tapi titik/underscore tetap dibedain.
2. **Unik per peran**: alias `Budi` di peran CS cuma boleh dipakai 1 orang. Tapi `Budi` boleh dipakai untuk peran berbeda (CS + Content).
3. **History aman**: transaksi yg udah ke-link tidak berubah saat alias diubah, kecuali transaksi yg pakai alias itu.
4. **Date validity**: alias punya `valid_from` & `valid_to` — buat handover Rena→Dewi. Transaksi sebelum cutoff tetap milik Rena, setelahnya ke Dewi.
5. **Auto-link**: setiap tambah/hapus alias, sistem otomatis re-scan transaksi yg pakai nama itu.

---

## Hak akses

| Role | Buat akun | Edit alias orang lain | Edit alias sendiri | Lihat |
|---|---|---|---|---|
| **Admin Data IT** | ✅ semua | ✅ semua | ✅ | ✅ semua |
| **Head divisi** | ❌ | ✅ tim sendiri | ❌ (cegah self-deal) | ✅ tim |
| **SPV divisi** | ❌ | ✅ tim sendiri | ❌ (cegah self-deal) | ✅ tim |
| **Staff** | ❌ | ❌ | ❌ | ✅ sendiri (Pengaturan) |
| **Direksi** | ❌ | ❌ | ❌ | ✅ semua (read-only) |

---

## Halaman & Flow

### `/admin/users/baru` — Bikin User Baru
Form punya section "Nama di Excel (Alias)". Muncul **per peran yg relevant** dengan divisi user. Tombol **Pilih dari Data** → popup nama unik di Excel + jumlah transaksi + warning kalau sudah dipakai.

### `/admin/users/[id]` — Edit User
- Lihat alias per peran
- Tambah/hapus alias (auto-relink transaksi)
- Tombol **Nonaktifkan** dengan dialog:
  - Pilih tanggal nonaktif
  - Transfer alias ke pengganti (opsional)
  - Atau biarkan kosong (transaksi baru → Inbox)

### `/admin/setup-alias` — Bulk Setup Wizard (1x)
Untuk migrasi data lama: nampilkan ringkasan per peran (berapa nama unmapped). Klik salah satu → wizard mapping detail per nama → save semua → auto-relink semua transaksi peran itu.

### `/admin/crm-sync/perlu-ditinjau` — Inbox Tinjau
Setelah upload Excel baru, nama yg belum ke-link akan muncul di sini. Admin tinjau & assign.

### `/admin/role-columns` — Kelola Peran
Aktifkan/nonaktifkan peran (CRM, Live, Content) kalau Excel mulai punya kolomnya. Edit nama tampilan & petunjuk.

### `/pengaturan` — User biasa
Section "Nama Anda di Excel" read-only. Plus info: "hubungi Admin/atasan kalau perlu ubah".

---

## Database

### Tabel baru (migration 0031–0033)

- **`crm_role_columns`** — daftar peran (CS, Adv, CRM, Live, Content) + status aktif
- **`user_role_aliases`** — alias per (akun, peran) + valid_from/valid_to
- **Kolom baru di `crm_transactions`** — `cs_user_id`, `adv_user_id`, `crm_user_id`, `live_user_id`, `content_user_id`

### RPC

- `relink_transactions_for_user(role, user_id)` — dipanggil tiap alias berubah
- `relink_transactions_for_role(role)` — buat re-scan massal (Bulk Setup)
- `get_unlinked_names(role)` — buat Inbox
- `get_excel_names_for_role(role)` — buat popup "Pilih dari Data"
- `normalize_alias(text)` — helper buat smart-normalize

---

## Cara apply migration

1. Buka Supabase Dashboard → SQL Editor
2. Jalankan secara berurutan:
   ```
   0031_user_role_aliases.sql
   0032_crm_transactions_user_ids.sql
   0033_alias_link_functions.sql
   ```
3. Cek di Table Editor → 2 tabel baru muncul, 5 kolom user_id muncul di `crm_transactions`.

## Cara pakai pertama kali

1. Apply 3 migration di atas.
2. Pastikan `crm_transactions` udah ada datanya (kalau belum → upload Excel + sync dulu lewat `/admin/crm-sync`).
3. Buka `/admin/setup-alias` → setup CS dulu, lalu Adv.
4. Selesai. Future upload akan auto-link berdasarkan alias.
