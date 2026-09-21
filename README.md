# PoC Pengadaan eSign & eMeterai TBIG

Proof-of-Concept (PoC) aplikasi sistem alur pengadaan barang dan jasa PT Tower Bersama Infrastructure Tbk (TBIG) yang terintegrasi dengan tanda tangan elektronik bersertifikasi dan pembubuhan e-Meterai resmi.

Fase 1 PoC mengimplementasikan **Mock ESign Provider** lengkap dengan simulasi tanda tangan, penempatan koordinat Lembar Pengesahan, pembubuhan eMeterai, dan antarmuka web OTP signer untuk pengujian menyeluruh tanpa dependensi pihak ketiga.

---

## 1. Fitur Utama

- **Otorisasi Berbasis Peran**: Portal internal TBIG (`/tbig/*`) dan Portal Rekanan Vendor (`/vendor/*`) dengan isolasi akses ketat (multi-tenant guard).
- **Generator Lembar Pengesahan**: Injeksi otomatis halaman pengesahan A4 di akhir PDF dengan koordinat presisi dan non-overlapping untuk tanda tangan TBIG, eMeterai, dan tanda tangan Vendor.
- **Workflow State Machine**: Status pengadaan dikendalikan secara atomik dan terpusat (`src/lib/workflow/pengadaan-workflow.ts`).
- **Penyedia eSign Abstrak (`ESignProvider`)**: Arsitektur modular yang memisahkan aplikasi dari implementasi vendor eSign (Fase 1: Mock Provider, Fase 2: Mekari Sandbox HMAC).
- **Simulasi Browser Penandatangan**: Halaman mock Mekari Sign (`/mock-mekari/sign/[jobId]`) dengan pratinjau dokumen dan verifikasi OTP (`123456`).
- **Audit Trail (Activity Log)**: Riwayat lengkap aktivitas setiap dokumen dari pembentukan draft hingga dokumen final.

---

## 2. Alur Status Pengadaan (Workflow Transitions)

```
[ Baru ] ──T1──> [ DRAFT ] ──T3──> [ MENUNGGU_TTD_TBIG ] ──T4──> [ MENUNGGU_PERSETUJUAN_VENDOR ]
                                                                             │             │
                                                                            T5            T6
                                                                             ▼             ▼
                                                                        [ DITOLAK ]  [ MENUNGGU_TTD_VENDOR ] (eMeterai)
                                                                                           │
                                                                                          T7 (Job SIGN_VENDOR)
                                                                                           ▼
                                                                                     [ MENUNGGU_TTD_VENDOR ] (Signer OTP)
                                                                                           │
                                                                                          T8
                                                                                           ▼
                                                                                       [ SELESAI ]
```

| Kode | Dari Status | Ke Status | Pemicu | Efek Samping |
|---|---|---|---|---|
| **T1** | (Baru) | `DRAFT` | TBIG simpan form + unggah PDF | Simpan file `ORIGINAL`, buat `PREPARED` |
| **T2** | `DRAFT` | `DRAFT` | TBIG perbarui data / PDF | Regenerate file `PREPARED` |
| **T3** | `DRAFT` | `MENUNGGU_TTD_TBIG` | TBIG klik "Tandatangani" | Buat `SignJob(AUTO_SIGN_TBIG)` |
| **T4** | `MENUNGGU_TTD_TBIG` | `MENUNGGU_PERSETUJUAN_VENDOR` | Event `COMPLETED` ttd TBIG | Simpan file `SIGNED_TBIG`, catat `tbigSignedAt` |
| **T5** | `MENUNGGU_PERSETUJUAN_VENDOR` | `DITOLAK` | Vendor klik "Tolak" + alasan (min 10 kar) | Catat `alasanPenolakan` & `vendorRespondedAt` |
| **T6** | `MENUNGGU_PERSETUJUAN_VENDOR` | `MENUNGGU_TTD_VENDOR` | Vendor klik "Setuju" | Buat `SignJob(STAMP_METERAI)` dari `SIGNED_TBIG` |
| **T7** | `MENUNGGU_TTD_VENDOR` | `MENUNGGU_TTD_VENDOR` | Event `COMPLETED` meterai | Simpan file `STAMPED_METERAI`, buat `SignJob(SIGN_VENDOR)` |
| **T8** | `MENUNGGU_TTD_VENDOR` | `SELESAI` | Event `COMPLETED` ttd vendor | Simpan file `FINAL`, catat `vendorSignedAt` |

---

## 3. Akun Pengguna Demo

Aplikasi dilengkapi akun bawaan hasil *database seed*:

| Role | Email | Password | Keterangan |
|---|---|---|---|
| **TBIG** | `tbig@poc.local` | `password123` | Admin Pengadaan TBIG |
| **VENDOR** | `vendor1@poc.local` | `password123` | PT Contoh Konstruksi Satu (PIC: Budi Santoso) |
| **VENDOR** | `vendor2@poc.local` | `password123` | PT Contoh Teknik Dua (PIC: Siti Rahma) |

---

## 4. Setup & Menjalankan Lokal

### Prasyarat
- Node.js versi 20 atau lebih baru
- npm versi 10 atau lebih baru
- Database PostgreSQL (disarankan project Supabase gratis)

### Langkah Instalasi
1. **Clone repository & pasang dependensi:**
   ```bash
   git clone <repo-url>
   cd poc-esign-ematerai
   npm install
   ```

2. **Konfigurasi Environment Variables:**
   Salin `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   Isi nilai-nilai berikut pada `.env`:
   - `DATABASE_URL`: Connection string PostgreSQL Transaction Pooler (port `6543`)
   - `DIRECT_URL`: Connection string PostgreSQL Session Pooler (port `5432`)
   - `SESSION_SECRET`: String acak minimal 32 karakter
   - `APP_BASE_URL`: `http://localhost:3000`
   - `STORAGE_DRIVER`: `supabase` (atau `local` untuk pengujian lokal tanpa storage Supabase)
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`: Diambil dari Dashboard Supabase

3. **Inisialisasi Database & Storage:**
   ```bash
   # Generate Prisma Client
   npx prisma generate

   # Terapkan migrasi database
   npm run db:deploy

   # Masukkan data awal (users & vendors)
   npm run db:seed

   # Setup private bucket storage di Supabase
   npm run storage:setup
   ```

4. **Jalankan Aplikasi:**
   ```bash
   npm run dev
   ```
   Buka browser pada [http://localhost:3000](http://localhost:3000).

---

## 5. Skenario Uji & Demo (±5 Menit)

Ikuti alur demo berikut untuk menguji keseluruhan fitur:

1. **Login sebagai TBIG (`tbig@poc.local` / `password123`):**
   - Buat pengadaan baru melalui tombol **+ Buat Pengadaan**.
   - Isi form (No. Surat Pesanan, Vendor, Harga, Periode, Lokasi) dan unggah file PDF contoh.
   - Periksa halaman pratinjau detail. Halaman Lembar Pengesahan otomatis terpasang di akhir dokumen.
2. **Tanda Tangan Elektronik TBIG:**
   - Klik tombol **Tandatangani sebagai TBIG** dan konfirmasi dialog.
   - Status berubah ke *Proses tanda tangan TBIG*. Setelah beberapa detik (auto-refresh), status otomatis berubah menjadi *Sudah ttd TBIG, menunggu persetujuan vendor*.
   - Pratinjau PDF menampilkan kotak tanda tangan TBIG.
3. **Persetujuan & Pembubuhan eMeterai Vendor (`vendor1@poc.local` / `password123`):**
   - Logout lalu login sebagai `vendor1@poc.local`.
   - Buka menu **Daftar Pengadaan**, pilih dokumen yang baru saja ditandatangani TBIG.
   - Klik tombol **Setuju & Lanjutkan** dan konfirmasi dialog persetujuan.
   - Dokumen menampilkan status *Sedang membubuhkan eMeterai…*. Auto-refresh akan memperbarui halaman saat pembubuhan selesai.
4. **Penandatanganan Vendor:**
   - Banner *Dokumen Siap Ditandatangani* muncul. Klik tombol **Lanjutkan Tanda Tangan**.
   - Halaman simulasi Mekari Sign terbuka. Masukkan kode OTP `123456` (atau klik *Auto OTP*), lalu klik **Tanda Tangani Dokumen**.
   - Pengguna diarahkan kembali ke portal vendor dengan status hijau **Sudah ttd vendor (selesai)**.
5. **Verifikasi Akhir & Unduh Dokumen Final:**
   - Klik **Unduh PDF Final**. Dokumen PDF memuat lengkap tanda tangan TBIG, eMeterai simulasi, dan tanda tangan Vendor.
   - Login kembali sebagai `tbig@poc.local` untuk memastikan status di sisi TBIG juga telah *SELESAI*.
6. **(Opsional) Pengujian Penolakan:**
   - Buat pengadaan lain sebagai TBIG, tanda tangani, lalu login sebagai vendor dan klik **Tolak Pengadaan** dengan mengisi alasan minimal 10 karakter.
   - Status berubah menjadi *DITOLAK* dan alasan penolakan tampil jelas di portal Vendor maupun TBIG.

---

## 6. Panduan Deployment ke Vercel (Production)

1. **Persiapan Project Supabase Production:**
   - Buat project Supabase khusus production di region Southeast Asia (Singapore).
   - Pastikan Row Level Security (RLS) aktif pada semua tabel schema `public`.
   - Jalankan script migrasi, seed, dan storage setup dari terminal lokal dengan mengarahkan env ke production:
     ```bash
     DATABASE_URL="<prod-pooler-url>" DIRECT_URL="<prod-direct-url>" npm run db:deploy
     DATABASE_URL="<prod-pooler-url>" DIRECT_URL="<prod-direct-url>" npm run db:seed
     SUPABASE_URL="<prod-url>" SUPABASE_SECRET_KEY="<prod-secret>" npm run storage:setup
     ```

2. **Pengaturan Project di Vercel:**
   - Hubungkan repository ke Vercel.
   - Pastikan **Build Command** menggunakan default: `prisma generate && next build`.
   - Set **Serverless Function Region** ke Singapore (`sin1`) agar sedekat mungkin dengan database Supabase.
   - Daftarkan seluruh Environment Variables di Vercel Project Settings:
     - `DATABASE_URL` (port `6543`, `?pgbouncer=true&connection_limit=1`)
     - `DIRECT_URL` (port `5432`)
     - `SESSION_SECRET`
     - `APP_BASE_URL` (URL domain Vercel Anda, mis. `https://poc-esign-ematerai.vercel.app`)
     - `STORAGE_DRIVER=supabase`
     - `SUPABASE_URL`
     - `SUPABASE_SECRET_KEY`
     - `SUPABASE_STORAGE_BUCKET=pengadaan-docs`
     - `ESIGN_MODE=mock` (Fase 1)
     - `ESIGN_WEBHOOK_TOKEN`

> [!NOTE]
> **Catatan Free Plan Supabase:** Project Supabase tier gratis otomatis di-*pause* jika tidak ada aktivitas selama 1 minggu. Sebelum presentasi atau demo, buka dashboard Supabase dan klik *Restore* bila project sedang ter-pause.

---

## 7. Skrip Pengujian Otomatis

Untuk memvalidasi integritas kode dan aturan workflow:
```bash
# Menjalankan verifikasi seluruh skenario (Skenario 1 - 8 PRD)
npx tsx --conditions react-server scripts/verify-all-scenarios.ts

# Linter & Typecheck
npm run lint
npm run typecheck
```
