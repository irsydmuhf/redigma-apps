# Plan: LMS Onboarding Advertiser (ADV) Marketplace

> Source PRD: ADV Marketplace Onboarding Application
> Keputusan arsitektur dari sesi grilling — Juni 2026

## Keputusan Arsitektur

Keputusan durable yang berlaku di semua phase:

- **Repo**: Satu repo `redigma-apps`, LMS hidup di route group `(lms)` dalam Next.js App Router
- **Routes ADV**: `/lms/login`, `/lms/register`, `/lms/dashboard`, `/lms/program/[id]`, `/lms/module/[id]`, `/lms/profile`
- **Routes Manager**: `/lms/manager/dashboard`, `/lms/manager/adv/[id]`, `/lms/manager/programs`, `/lms/manager/programs/new`, `/lms/manager/programs/[id]/edit`, `/lms/manager/programs/[id]/invite`, `/lms/manager/approvals`, `/lms/manager/reports`
- **Routes Admin**: `/lms/admin/users`
- **Database**: Schema `lms` terpisah di Supabase project yang sama (`jphskwrkbyaimxrgtqrw`). Tidak menyentuh schema `public` milik redigma-apps.
- **Auth**: Email + password via Supabase Auth. `auth.users` di-share dengan redigma-apps (satu project), tapi `lms.user_profiles` terpisah dari `public.user_profiles`.
- **Role LMS**: 3 role — `admin` (Data IT/superadmin), `manager` (Manager/Head/SPV), `adv` (Karyawan ADV)
- **Middleware**: Route `/lms/*` dilindungi middleware tersendiri, cek session + role dari `lms.user_profiles`
- **Storage**: Supabase Storage bucket `lms-uploads` untuk screenshot task submission dan sertifikat PDF
- **Email**: Resend via Supabase Edge Function untuk semua transactional email
- **Cron**: `pg_cron` di Supabase, jalan setiap hari jam 08.00 WIB untuk cek ADV tertinggal
- **Deployment**: Vercel (portable ke VPS via Dockerfile kapan saja tanpa ubah kode)
- **Package manager**: pnpm (konsisten dengan redigma-apps)
- **UI**: Tailwind CSS + shadcn/ui, font Inter, bahasa campuran Indonesia/Inggris

### Key Models (schema `lms`)

```
programs → program_phases → program_modules → module_content
                                           → module_tasks
                                           → post_test_questions
programs → program_milestones
programs → invite_links
programs → program_enrollments → module_progress → task_submissions
                                                 → post_test_attempts
                               → milestone_achievements
lms.user_profiles
notifications
```

### Invite Link
- `expires_at` nullable — no-expire by default, Manager bisa set tanggal opsional
- Manager bisa nonaktifkan manual via `is_active = false`

### Sequential Unlock Rule
Modul N+1 unlock **hanya jika**: semua task modul N berstatus `approved` **DAN** post-test modul N `passed = true`

### Post-Test Snapshot
Soal di-snapshot saat ADV mulai attempt — perubahan soal oleh Manager hanya berlaku untuk ADV yang belum mulai attempt di modul tersebut

---

## Phase 1: Auth & Skeleton

**User stories**:
- ADV mendaftar via invite link
- ADV menunggu approval Manager
- Manager approve/reject enrollment ADV
- Manager generate invite link per program

### What to build

Schema `lms` dibuat di Supabase dengan tabel: `user_profiles`, `invite_links`, `programs` (struktur dasar saja), dan `program_enrollments`. Auth menggunakan email + password — halaman `/lms/login` dan `/lms/register?token=...` terpisah dari auth redigma-apps. Middleware melindungi semua route `/lms/*` dan mengarahkan berdasarkan role.

Flow end-to-end: Manager login → generate invite link untuk program → ADV klik link → diarahkan ke form registrasi dengan info program → submit → enrollment status `pending` → Manager dapat notifikasi (in-app saja, belum email) → Manager approve/reject → ADV bisa login dan lihat halaman kosong sesuai role-nya.

### Acceptance criteria

- [ ] Schema `lms` terbuat di Supabase dengan tabel `user_profiles`, `invite_links`, `programs`, `program_enrollments`
- [ ] Halaman `/lms/login` berfungsi dengan email + password (terpisah dari login redigma-apps)
- [ ] Halaman `/lms/register?token=[token]` menampilkan info program dan form registrasi
- [ ] Registrasi dengan token invalid atau expired ditolak dengan pesan error
- [ ] Enrollment baru masuk dengan status `pending`
- [ ] Manager melihat daftar enrollment pending di `/lms/manager/approvals`
- [ ] Manager bisa approve → status jadi `active`, atau reject → status jadi `rejected`
- [ ] ADV yang belum approved tidak bisa akses halaman dalam `/lms/*`
- [ ] Manager bisa generate invite link di `/lms/manager/programs/[id]/invite`
- [ ] Sidebar tampil berbeda per role (adv / manager / admin)
- [ ] Route `/lms/*` redirect ke `/lms/login` jika belum authenticated

---

## Phase 2: Program Builder

**User stories**:
- Manager membuat program baru dari scratch (nama, deskripsi, phases, modules, tasks, content)
- Manager menduplikasi program yang sudah ada
- ADV melihat learning path lengkap program (semua modul, status locked/unlocked)

### What to build

Tabel `program_phases`, `program_modules`, `module_content`, `module_tasks` ditambahkan ke schema `lms`. Manager bisa membangun kurikulum lengkap via UI: buat program → tambah phase → tambah modul per phase → tambah konten (teks, video embed URL, file) → tambah task per modul. Duplikasi program menyalin seluruh struktur (phases, modules, content, tasks) ke program baru yang bisa diedit bebas.

ADV yang sudah enrolled bisa membuka `/lms/program/[id]` dan melihat seluruh learning path dengan status tiap modul — modul pertama `in_progress`, sisanya `locked`.

### Acceptance criteria

- [ ] Manager bisa membuat program baru dengan nama, deskripsi, dan platform di `/lms/manager/programs/new`
- [ ] Manager bisa menambah phase (judul, order, durasi hari) ke dalam program
- [ ] Manager bisa menambah modul ke dalam phase (judul, deskripsi, estimasi hari, order)
- [ ] Manager bisa menambah konten ke modul: teks (rich text), video embed (URL), file upload (PDF/PPT ke Storage)
- [ ] Manager bisa menambah task ke modul (judul, deskripsi, requires_screenshot, requires_link)
- [ ] Manager bisa menduplikasi program — seluruh struktur tersalin, program baru status draft
- [ ] ADV melihat learning path di `/lms/program/[id]`: semua phase dan modul dengan status locked/in_progress
- [ ] Modul pertama otomatis `in_progress` saat enrollment diapprove, sisanya `locked`
- [ ] ADV tidak bisa membuka halaman modul yang masih `locked`

---

## Phase 3: Module Completion & Task Submission

**User stories**:
- ADV membaca materi modul (teks, tonton video, unduh file)
- ADV submit bukti task berupa screenshot dan/atau link + catatan
- ADV melihat feedback Manager (approved/rejected + komentar)
- Manager approve atau reject submission dengan komentar
- Modul berikutnya unlock setelah semua task approved (post-test belum ada di phase ini)

### What to build

Halaman `/lms/module/[id]` menampilkan semua konten modul secara berurutan dan daftar task yang harus diselesaikan. ADV upload screenshot ke Supabase Storage dan/atau paste link, tambahkan catatan, lalu submit. Setiap task submission masuk ke antrian Manager di `/lms/manager/approvals`. Manager approve atau reject dengan komentar — ADV langsung bisa lihat status dan komentar.

Setelah semua task di satu modul berstatus `approved`, sistem otomatis mengecek apakah modul bisa selesai. Di phase ini (sebelum post-test ada), modul langsung `completed` dan modul berikutnya unlock.

### Acceptance criteria

- [ ] Halaman `/lms/module/[id]` menampilkan konten teks, video embed, dan tombol download file
- [ ] ADV bisa submit task: upload minimal 1 screenshot (jika `requires_screenshot`) dan/atau isi link (jika `requires_link`), tambah catatan opsional
- [ ] File screenshot tersimpan di Supabase Storage bucket `lms-uploads` dengan signed URL
- [ ] Submission masuk ke antrian Manager dengan status `pending`
- [ ] Manager melihat antrian submission di `/lms/manager/approvals` dengan filter per program
- [ ] Manager bisa approve → status `approved`, atau reject → status `rejected` + wajib isi komentar
- [ ] ADV melihat status dan komentar feedback di halaman modul
- [ ] ADV yang di-reject bisa submit ulang (submission baru, bukan edit)
- [ ] Setelah semua task satu modul `approved` → modul status `completed` → modul berikutnya unlock

---

## Phase 4: Post-Test

**User stories**:
- ADV mengerjakan post-test pilihan ganda setelah setiap modul (max 3x, lulus ≥80%)
- ADV melihat skor setiap percobaan dan sisa attempt
- Manager menambah, mengedit, menghapus soal post-test kapan saja
- Perubahan soal hanya berlaku untuk ADV yang belum mulai attempt
- Manager dapat notifikasi (in-app) jika ADV gagal 3x

### What to build

Tabel `post_test_questions` dan `post_test_attempts` ditambahkan. Manager bisa kelola soal (pilihan ganda, 4 opsi, 1 jawaban benar) di halaman edit program. Saat ADV mulai post-test, soal di-snapshot ke dalam record attempt sehingga perubahan soal setelahnya tidak mempengaruhi attempt yang sedang berjalan.

Sequential unlock diperketat: modul `completed` dan modul berikutnya unlock **hanya jika** semua task `approved` DAN post-test `passed`. Jika gagal 3x, ADV mendapat notifikasi in-app dan Manager juga mendapat notifikasi in-app untuk koordinasi manual.

### Acceptance criteria

- [ ] Manager bisa tambah/edit/hapus soal post-test per modul di halaman edit program
- [ ] Soal di-snapshot saat ADV mulai attempt pertama — perubahan setelah itu tidak berlaku untuk attempt tersebut
- [ ] ADV melihat tombol "Kerjakan Post-Test" di halaman modul hanya setelah semua task `approved`
- [ ] ADV mengerjakan post-test — soal ditampilkan satu per satu atau semua sekaligus
- [ ] Skor dihitung otomatis, tampil langsung setelah submit
- [ ] ADV melihat sisa attempt (misal: "Percobaan 2 dari 3")
- [ ] Jika skor ≥80% → `passed = true` → modul `completed` → modul berikutnya unlock
- [ ] Jika skor <80% dan masih ada sisa attempt → ADV bisa coba lagi
- [ ] Jika gagal 3x → ADV dapat notifikasi in-app → Manager dapat notifikasi in-app
- [ ] ADV yang sudah lulus tidak bisa mengulang post-test

---

## Phase 5: Dashboard & Progress Tracking

**User stories**:
- ADV melihat task prioritas hari ini di halaman utama
- Manager melihat summary angka (total ADV aktif, on-track, at-risk, sudah lulus)
- Manager filter dan drill-down per program
- Manager melihat kartu per ADV (nama, program, progress, modul terakhir, flag at-risk)
- Manager melihat detail progress satu ADV

### What to build

Dashboard ADV (`/lms/dashboard`) menampilkan task yang harus dikerjakan hari ini berdasarkan modul yang sedang `in_progress` — task yang belum disubmit atau di-reject. Progress keseluruhan ditampilkan sebagai persentase modul selesai.

Dashboard Manager (`/lms/manager/dashboard`) menampilkan angka summary lintas semua program, dengan kartu per ADV yang menunjukkan status — at-risk jika ADV belum menyelesaikan modul sesuai `estimated_days` sejak modul dibuka. Filter per program memungkinkan Manager fokus ke satu program.

### Acceptance criteria

- [ ] `/lms/dashboard` (ADV) menampilkan daftar task yang pending atau rejected dari modul aktif
- [ ] ADV melihat progress bar keseluruhan (% modul completed dari total modul program)
- [ ] `/lms/manager/dashboard` menampilkan angka: total ADV aktif, on-track, at-risk, lulus
- [ ] Manager bisa filter dashboard berdasarkan program tertentu
- [ ] Setiap ADV ditampilkan dalam kartu: nama, program, % progress, modul terakhir diselesaikan
- [ ] Kartu ADV at-risk diberi flag merah (at-risk = belum selesai modul dalam `estimated_days` sejak dibuka)
- [ ] Manager bisa klik kartu ADV → `/lms/manager/adv/[id]` untuk lihat detail progress semua modul
- [ ] Halaman detail ADV menampilkan status tiap modul, hasil post-test, dan riwayat submission task

---

## Phase 6: Milestones & Sertifikat

**User stories**:
- Manager mendefinisikan milestone per program (nama, deskripsi, kondisi)
- Sistem auto-check kondisi milestone saat modul selesai
- Manager approve milestone secara manual sebagai final kelulusan
- ADV menerima sertifikat PDF + badge saat milestone final diapprove
- ADV melihat status milestone di profil dan dashboard

### What to build

Tabel `program_milestones` dan `milestone_achievements` ditambahkan. Manager mendefinisikan milestone dengan kondisi fleksibel (misalnya: "semua modul phase 1 selesai", atau "lulus semua post-test dengan skor ≥90%") yang disimpan sebagai JSON. Setiap kali modul diselesaikan, sistem cek apakah kondisi milestone terpenuhi — jika ya, Manager dapat notifikasi in-app untuk approval manual.

Setelah Manager approve milestone final, sistem generate sertifikat PDF (nama ADV, nama program, tanggal lulus, nama Manager) menggunakan `@react-pdf/renderer`, simpan ke Supabase Storage, dan ADV bisa download.

### Acceptance criteria

- [ ] Manager bisa tambah/edit milestone per program di halaman edit program
- [ ] Sistem otomatis cek kondisi milestone setiap kali modul ADV berstatus `completed`
- [ ] Manager dapat notifikasi in-app jika kondisi milestone ADV terpenuhi
- [ ] Manager bisa approve atau tolak milestone dari `/lms/manager/adv/[id]`
- [ ] Setelah milestone final diapprove → sertifikat PDF digenerate dan tersimpan di Storage
- [ ] ADV bisa download sertifikat dari `/lms/profile` dan dari halaman program
- [ ] Badge milestone tampil di profil ADV
- [ ] ADV melihat daftar milestone + status (belum tercapai / menunggu approval / tercapai) di dashboard dan halaman program

---

## Phase 7: Notifikasi & Alert Harian

**User stories**:
- ADV dapat notifikasi in-app dan email jika tertinggal >1 hari dari jadwal
- Manager dapat notifikasi in-app dan email jika ADV tertinggal >1 hari
- Manager dapat notifikasi saat ADV baru mendaftar
- ADV dapat email saat enrollment diapprove
- Notifikasi in-app dengan bell icon dan badge unread count

### What to build

Tabel `notifications` sudah digunakan sejak Phase 1 untuk in-app — phase ini menyempurnakannya dengan bell icon di header, badge unread count, dan mark-as-read. Resend diintegrasikan via Supabase Edge Function untuk semua transactional email.

`pg_cron` job dijadwalkan setiap hari jam 08.00 WIB: query semua ADV dengan modul `in_progress` yang sudah melewati `estimated_days` sejak dibuka → insert notifikasi in-app ke ADV dan Manager terkait → kirim email via Resend.

### Acceptance criteria

- [ ] Bell icon di header menampilkan badge jumlah notifikasi yang belum dibaca
- [ ] Dropdown notifikasi menampilkan daftar notif terbaru dengan timestamp
- [ ] Klik notifikasi → mark as read → redirect ke halaman relevan
- [ ] Email dikirim via Resend saat: enrollment approved, enrollment rejected
- [ ] `pg_cron` berjalan setiap hari 08.00 WIB — ADV tertinggal dapat in-app + email
- [ ] Manager dapat in-app + email jika ADV di timnya tertinggal >1 hari
- [ ] Manager dapat in-app saat ADV baru mendaftar ke programnya (sudah ada sejak Phase 1, phase ini tambahkan email)
- [ ] Manager dapat in-app + email saat ADV gagal post-test 3x (sudah ada in-app sejak Phase 4, tambahkan email)
- [ ] Email menggunakan template yang rapi dengan nama penerima dan link langsung ke halaman relevan

---

## Phase 8: Laporan, Admin & Polish

**User stories**:
- Manager export laporan progress ADV dalam format Excel/CSV dan PDF
- Manager melihat riwayat semua ADV yang pernah onboarding (termasuk yang lulus)
- Admin mengelola akun user (list, reset password, nonaktifkan)
- Admin melihat semua program lintas semua Manager
- ADV melihat profil (program aktif, progress, badge, sertifikat, riwayat program)

### What to build

Halaman `/lms/manager/reports` menyediakan export data progress semua ADV per program dalam format Excel (menggunakan package `xlsx` yang sudah ada di repo) dan PDF (menggunakan `@react-pdf/renderer`). Data mencakup: nama ADV, program, status enrollment, % progress, nilai post-test per modul, tanggal lulus.

Admin panel di `/lms/admin/users` memungkinkan Data IT melihat semua user LMS, nonaktifkan akun, dan reset password. Halaman profil ADV merangkum pencapaian, badge, dan sertifikat yang bisa didownload.

### Acceptance criteria

- [ ] `/lms/manager/reports` menampilkan tabel progress semua ADV dengan filter per program
- [ ] Export Excel menghasilkan file `.xlsx` dengan kolom: nama, program, status, % progress, skor post-test, tanggal lulus
- [ ] Export PDF menghasilkan laporan yang rapi dan siap dicetak
- [ ] Manager melihat riwayat ADV yang sudah lulus (status `completed`) di dashboard
- [ ] `/lms/admin/users` menampilkan semua user LMS (ADV + Manager) dengan role dan status
- [ ] Admin bisa nonaktifkan akun — user tidak bisa login, enrollment tidak berpengaruh
- [ ] Admin bisa reset password user (kirim email reset via Supabase Auth)
- [ ] Admin melihat semua program dari semua Manager
- [ ] `/lms/profile` (ADV) menampilkan: info akun, program aktif + progress, badge, sertifikat (downloadable), riwayat program selesai
- [ ] Semua halaman responsif untuk mobile browser
