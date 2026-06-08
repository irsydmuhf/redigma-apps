# UAT Checklist — MVP Definition of Done

User Acceptance Test sebelum production launch. Lakukan di staging environment
dengan Data IT + 1 SPV dari divisi pilot (CS / Finance).

## 1. Auth & User Management

- [ ] Magic link login berhasil end-to-end (klik link di email → masuk dashboard)
- [ ] Login password (fallback) berhasil
- [ ] User yang belum terdaftar tidak bisa login
- [ ] Logout (tombol Keluar di header) berhasil
- [ ] Admin bisa create user baru di `/admin/users/baru`
  - Email valid + nama + assign 2+ divisi → user terbuat
  - Magic link login bekerja untuk user baru tersebut
- [ ] Admin bisa nonaktifkan user yang sudah resign
- [ ] User multi-divisi: switcher di header aktif, ganti divisi update URL/path

## 2. Upload CSV / Excel (Phase 3-4)

- [ ] File picker terima `.csv`, `.xlsx`, `.xls`
- [ ] Auto-detect tipe data benar:
  - Tanggal `01/06/2026` → ISO `2026-06-01`
  - Angka `1.500.000,50` → `1500000.50`
  - `Rp 500000` → currency
  - `081234567890` → phone `6281234567890`
  - Email regex valid
  - Boolean ya/tidak/yes/no/1/0
- [ ] Edit display name kolom → physical name preview update otomatis
- [ ] Pilih tipe data via dropdown → preview re-parse real-time
- [ ] Sel auto-normalized di-highlight kuning + tooltip
- [ ] Sel error di-highlight merah + tooltip
- [ ] Edit inline sel error → re-parse jadi hijau
- [ ] Tombol Lanjutkan disabled kalau ada error rows
- [ ] Bulk "Skip semua baris error" jalan
- [ ] Toggle "Tampilkan hanya error" jalan
- [ ] Convention badge muncul untuk kolom `no_wa`/`email`/`sku`/`nik`
- [ ] Submit → dataset baru terbuat di Supabase + data masuk

## 3. Smart Match & Schema Drift (Phase 5)

- [ ] Upload CSV bulan-2 dengan struktur sama → banner match ≥80% muncul
- [ ] Klik "Append" → mode berubah, schema editor diganti drift panel
- [ ] Kolom baru: checkbox default ON, bisa skip
- [ ] Kolom hilang: ditampilkan info "akan diisi NULL"
- [ ] Submit append → row ter-insert ke tabel existing, kolom baru ditambahkan
- [ ] `schema_changelog` punya 2 entry baru (add_column + append_data)

## 4. Dedup & Raw Backup (Phase 6)

- [ ] Upload file sama 2x → warning kuning "File sudah pernah di-upload"
- [ ] Bisa dismiss warning dan tetap lanjut
- [ ] Append dengan kolom unique key:
  - Mode "Skip duplikat": baris yang `_row_hash` sama di-skip
  - Mode "Update": baris di-update
  - Mode "Insert": semua di-insert (warning bisa double-count)
- [ ] Post-import summary card muncul: rows new / skipped / updated
- [ ] File raw tersimpan di Supabase Storage bucket `raw-imports`
- [ ] Checkbox "Data historis (backfill)" tersimpan di `import_jobs.is_backfill`

## 5. Edge Function untuk File Besar (Phase 7)

- [ ] Upload file <5MB → flow client-side, redirect ke post-import summary di wizard
- [ ] Upload file ≥5MB → banner ungu muncul: "File besar, diproses background"
- [ ] Submit large file → redirect ke `/datasets/{id}?job={jobId}`
- [ ] ImportProgressCard muncul di dataset detail page
- [ ] Progress bar update real-time (via Realtime subscription)
- [ ] Bisa tutup tab, buka lagi → progress tetap jalan, status update saat done
- [ ] Status berubah jadi "Selesai" dengan summary counts

## 6. Riwayat Import & Rollback (Phase 8)

- [ ] `/riwayat` tampilkan semua import sesuai RLS user
- [ ] Filter pills berfungsi (Selesai / Diproses / Antri / Gagal / Di-rollback)
- [ ] Per row: nama dataset, file, mode, user, tanggal, counts
- [ ] Badge "Backfill" muncul untuk import historis
- [ ] Tombol Rollback muncul untuk import yang punya akses
- [ ] Klik Rollback → confirm → data hilang dari `/datasets/{id}` (soft-delete)
- [ ] Row status berubah jadi "Rolled back"
- [ ] `audit_log` punya entry `rollback_import`

## 7. Trash (Phase 8)

- [ ] `/trash` hanya bisa diakses admin
- [ ] User non-admin redirect ke /dashboard
- [ ] List menampilkan semua import yang rolled_back_at != null
- [ ] Klik Restore → data muncul lagi di dataset
- [ ] Klik Permanent Delete (2x konfirmasi) → row hilang permanen dari DB
- [ ] `audit_log` ada entry restore / permanent_delete

## 8. RBAC & RLS (Phase 9)

- [ ] Staff CS query `/datasets` → cuma lihat dataset CS
- [ ] Login sebagai user dengan multi-divisi → lihat dataset multi-divisi
- [ ] Login sebagai Direksi:
  - Lihat semua dataset semua divisi ✓
  - Tidak bisa upload (warning "tidak ada role staff/spv/head") ✓
  - Tidak bisa rollback (tombol tidak muncul) ✓
  - Tidak bisa akses /admin/users (redirect) ✓
  - Tidak bisa akses /trash (redirect) ✓
- [ ] Verifikasi via `verify_rls_matrix.sql`: semua dataset punya 4 policies

## 9. Export CSV (Phase 10)

- [ ] Tombol "Export CSV" di `/datasets/{id}` aktif
- [ ] Klik → download CSV dengan nama `{display_name}_{date}.csv`
- [ ] CSV hanya berisi kolom user (kolom system `_*` di-hide)
- [ ] Header CSV pakai display_name, bukan physical_name
- [ ] Boolean ditampilkan "Ya"/"Tidak" bukan true/false
- [ ] Dataset >5000 baris: warning truncated muncul

## 10. UI/UX & Bahasa

- [ ] Semua tombol, label, pesan error dalam Bahasa Indonesia
- [ ] Layout sidebar + header konsisten di semua halaman
- [ ] Sidebar hide menu admin kalau user bukan admin
- [ ] Stat card vibrant mesh-gradient ter-render correct di Chrome/Firefox/Safari
- [ ] Form di mobile (tablet) tetap usable
- [ ] Tidak ada console error fatal

## 11. Performance

- [ ] Upload file 100k baris client-side selesai < 2 menit
- [ ] Upload file 500k baris via Edge Function selesai < 5 menit
- [ ] Dataset viewer load <2 detik untuk 200 rows
- [ ] Smart match query <500ms

## 12. Disaster Recovery

- [ ] Rollback import test → restore test → data identik
- [ ] Permanent delete tidak bisa di-restore (di staging, tidak di prod test)
- [ ] Supabase backup terbukti bisa di-restore (test di staging duplicate)

---

**Tanggal UAT:** _isi_
**Tested by:** _Data IT name_
**Witnesses:** _SPV CS_, _SPV Finance_
**Sign-off:** Owner

**Hasil:** [ ] PASS — ready for prod  /  [ ] BLOCKED — issue list di bawah:
