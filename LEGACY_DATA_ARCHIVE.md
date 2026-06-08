# Legacy Data Archive

Catatan semua spreadsheet & data historis dari era pre-Redigma Super App.
Spreadsheet ini **tidak dihapus** — tetap sebagai arsip read-only di Google Drive
(atau lokasi lain). Dokumen ini track apakah sudah / belum di-backload ke aplikasi.

Update setiap kali Anda menambah/menyelesaikan migrasi data historis.

---

## Format Entry

```
- [divisi] Nama Spreadsheet
  - Link: <url google drive / sharepoint>
  - Periode data: <tanggal awal> – <tanggal akhir>
  - Estimasi baris: <jumlah>
  - Backload status: [ ] Belum / [x] Sudah ke dataset `nama_tabel` pada YYYY-MM-DD
  - Catatan: <opsional>
```

---

## Wave 1 — Critical (target: minggu 9-10)

### Finance

- [ ] Jurnal Akuntansi 2025 Full Year
  - Link: _ganti dengan URL Google Drive_
  - Periode: 2025-01-01 – 2025-12-31
  - Estimasi baris: ?
  - Backload status: [ ] Belum

- [ ] Aging Receivable per Desember 2025
  - Link: _ganti dengan URL_
  - Periode: snapshot 2025-12-31
  - Backload status: [ ] Belum

### Advertiser

- [ ] Campaign Performance Meta — 6 bulan terakhir
  - Link: _ganti dengan URL_
  - Periode: 2025-12-01 – 2026-05-31
  - Backload status: [ ] Belum

- [ ] Campaign Performance Shopee — 6 bulan terakhir
  - Link: _ganti dengan URL_
  - Periode: 2025-12-01 – 2026-05-31
  - Backload status: [ ] Belum

- [ ] Campaign Performance TikTok — 6 bulan terakhir
  - Link: _ganti dengan URL_
  - Periode: 2025-12-01 – 2026-05-31
  - Backload status: [ ] Belum

### CRM

- [ ] Customer Master Aktif (CRM Pulse)
  - Link: _ganti dengan URL_
  - Backload status: [ ] Belum

- [ ] Transaksi 12 bulan terakhir
  - Link: _ganti dengan URL_
  - Periode: 2025-06-01 – 2026-05-31
  - Backload status: [ ] Belum

### Customer Service

- [ ] Tiket Open (in-progress)
  - Link: _ganti dengan URL_
  - Backload status: [ ] Belum

- [ ] Tiket Closed 3 bulan terakhir
  - Link: _ganti dengan URL_
  - Periode: 2026-03-01 – 2026-05-31
  - Backload status: [ ] Belum

### Inventory & Sales (Herbal)

- [ ] Stok Current per Produk
  - Link: _ganti dengan URL_
  - Backload status: [ ] Belum
  - Catatan: Penting untuk produk dengan expiry date

- [ ] Sales 12 bulan terakhir
  - Link: _ganti dengan URL_
  - Periode: 2025-06-01 – 2026-05-31
  - Backload status: [ ] Belum

---

## Wave 2 — High Value (target: bulan 3-4 setelah launch)

### HR

- [ ] Master Karyawan Aktif
  - Link: _ganti dengan URL_
  - Backload status: [ ] Belum

- [ ] Absensi 6 bulan terakhir
  - Link: _ganti dengan URL_
  - Backload status: [ ] Belum

### Content Creator

- [ ] Performance Meta Content 3 bulan terakhir
  - Link: _ganti dengan URL_
  - Backload status: [ ] Belum

- [ ] Performance TikTok Content 3 bulan terakhir
  - Link: _ganti dengan URL_
  - Backload status: [ ] Belum

---

## Wave 3 — Forward-only (tidak akan di-backload)

Data berikut tetap diarsip di Google Drive read-only. Tidak akan dipindah ke
aplikasi kecuali ada permintaan spesifik.

- Logs activity karyawan pre-2024
- Email marketing campaigns >2 tahun lalu
- ...tambah sesuai kebutuhan

---

## Petunjuk Backload

1. **Buka spreadsheet di Google Sheets / Excel** yang akan di-backload
2. **Save as CSV** atau langsung pakai `.xlsx`
3. Login ke `app.redigma.com` (atau `staging.redigma.com` untuk dry-run)
4. Klik **Upload CSV** di sidebar
5. **Centang "Data historis (backfill)"** di toolbar kanan bawah
6. Setelah submit, update entry di sini menjadi `[x] Sudah ke dataset xxx`
7. Commit perubahan ke repo
