# Architecture & Technical Decisions Log

Dokumen ini mencatat keputusan teknis, kompromi arsitektural, atau deviasi dari PRD sesuai Aturan AI Agent #6.

---

## Format Catatan
- **ID / Tanggal**: YYYY-MM-DD - Judul Keputusan
- **Konteks**: Alasan mengapa keputusan ini perlu diambil
- **Keputusan**: Solusi yang dipilih (dipilih yang paling sederhana)
- **Konsekuensi / Catatan**: Dampak atau catatan untuk fase selanjutnya

---

## Log Keputusan

### 2026-09-21 - Inisialisasi Stack Next.js 16 + React 19 + Tailwind CSS v4 + Prisma
- **Konteks**: Inisialisasi project Next.js terbaru via `create-next-app` menggunakan template standar App Router dengan TypeScript dan Tailwind CSS v4.
- **Keputusan**: Menggunakan Prisma sebagai ORM dan menyiapkan script dev, build, lint, typecheck, dan database migration sesuai Step 1.1 PRD.
- **Konsekuensi**: Mengikuti arsitektur Next.js App Router terbaru dan mempersiapkan integrasi Prisma client.

### 2026-09-21 - Konfigurasi Prisma 7 (`prisma7.config.ts`)
- **Konteks**: Versi Prisma yang terpasang adalah Prisma v7.x (`7.10.0`), di mana Prisma memisahkan konfigurasi runtime/datasource ke file konfigurasi TypeScript (`prisma7.config.ts`) dengan `defineConfig`.
- **Keputusan**: Sesuai catatan PRD Bagian 4.1, konfigurasi URL diarahkan ke `process.env["DATABASE_URL"]` pada `prisma7.config.ts`, dan migrasi memanfaatkan `DIRECT_URL` sesuai kebutuhan Prisma CLI.
- **Konsekuensi**: Menggunakan `dotenv/config` dan `tsx` untuk mendukung eksekusi config TypeScript dan script seed.

### 2026-09-21 - Driver Adapter `@prisma/adapter-pg` untuk Prisma 7 & RLS Shadow DB Handling
- **Konteks**: Prisma Client di Prisma 7 memerlukan driver adapter SQL (`@prisma/adapter-pg` + `pg`) untuk eksekusi query PostgreSQL, dan migrasi shadow database mengevaluasi skrip RLS dari basis data kosong.
- **Keputusan**: Menggunakan `@prisma/adapter-pg` dengan connection pool `pg`, menginisialisasi singleton di `src/lib/db.ts`, dan menggunakan `ALTER TABLE IF EXISTS "_prisma_migrations"` pada migrasi `enable_rls` agar kompatibel dengan shadow database Prisma Migrate.
- **Konsekuensi**: Eksekusi runtime berjalan cepat dan stabil, seluruh tabel Supabase terproteksi RLS, dan migrasi dev berjalan bersih.

### 2026-09-21 - Autentikasi `iron-session` & Proteksi Route di Middleware
- **Konteks**: Diperlukan sesi terenkripsi tanpa dependensi state eksternal (Supabase Auth tidak dipakai sesuai PRD), serta verifikasi role di middleware dan Server Actions.
- **Keputusan**: Menggunakan `iron-session` v8 dengan cookie terenkripsi `poc_tbig_session`. Pada `middleware.ts`, autentikasi dievaluasi menggunakan `unsealData` untuk kompatibilitas performa tinggi, dan helper `requireRole` mengamankan Server Components / layout.
- **Konsekuensi**: Autentikasi stateless, aman, dan mematuhi isolasi role TBIG vs Vendor.

### 2026-09-21 - Abstraksi Storage & Proteksi Private File Stream
- **Konteks**: Dokumen pengadaan sensitif harus disimpan secara private di Supabase Storage tanpa URL publik langsung, dengan opsi fallback `LocalStorage` untuk pengembangan offline.
- **Keputusan**: Dibuat interface `Storage` dengan implementasi `SupabaseStorage` (menggunakan client `server-only` dan secret key) dan `LocalStorage`. Route `api/files/[fileId]` memeriksa izin aktor (isolasi vendor dan status draft) sebelum men-stream dokumen sebagai `application/pdf` inline.
- **Konsekuensi**: Dokumen aman dari akses publik tidak sah, policy storage client tertutup total, dan siap untuk deployment serverless Vercel.

### 2026-09-21 - Generator Lembar Pengesahan & Single Source of Truth Layout
- **Konteks**: Setiap dokumen pengadaan wajib disematkan halaman Lembar Pengesahan di akhir PDF dengan penempatan kotak tanda tangan dan meterai yang presisi dan tidak tumpang tindih.
- **Keputusan**: Layout koordinat disimpan tunggal di `src/lib/pdf/signature-layout.ts` dengan sistem koordinat top-left origin A4 (595 × 842 pt), dikonversi secara matematis saat digambar oleh `pdf-lib`. Generator menambahkan data terstruktur (tabel pengadaan, nama penandatangan, footer) dan helper `toMekariAnnotation` dipersiapkan untuk integrasi Mekari di Fase 2.
### 2026-09-21 - Workflow Modul Pengadaan (Step 1.6) & Atomic Execution
- **Konteks**: Modul pengadaan harus mematuhi Aturan AI Agent #4 (seluruh perubahan status harus melalui modul workflow) dan mengelola file versi `ORIGINAL` dan `PREPARED` beserta log audit `ActivityLog`.
- **Keputusan**: Seluruh operasi CRUD dan transisi status (T1 `createDraftPengadaan`, T2 `updateDraftPengadaan`, serta `deleteDraftPengadaan`) diisolasi di `src/lib/workflow/pengadaan-workflow.ts`. Pembuatan draft memanfaatkan atomic nested insert Prisma (otomatis membungkus `Pengadaan`, `DocumentFile`, dan `ActivityLog` dalam satu transaksi native PostgreSQL tanpa session lock), dan penghapusan memanfaatkan native foreign key `onDelete: Cascade`.
- **Konsekuensi**: Operasi database bersifat atomik, bebas dari masalah connection exhaustion pada PgBouncer/Supabase pooler (port 6543), dan kode server action `src/app/(tbig)/actions.ts` tetap tipis dan bersih dari query status langsung.
### 2026-09-21 - ESignProvider Interface, MockESignProvider & Asynchronous Workflow Handling (Step 1.7)
- **Konteks**: Diperlukan interface provider tanda tangan yang seragam (`ESignProvider`) untuk memisahkan domain aplikasi dari implementasi vendor (Aturan AI Agent #4), implementasi `MockESignProvider` untuk simulasi Fase 1, serta penanganan event webhook yang idempoten dan aman.
- **Keputusan**:
  1. Dibuat interface `ESignProvider` di `src/lib/esign/types.ts` dan factory `getESignProvider()` di `src/lib/esign/index.ts`.
  2. `MockESignProvider` menghasilkan tanda tangan & meterai simulasi dengan watermark diagonal menggunakan `pdf-lib` (`src/lib/pdf/stamp-simulation.ts`), menyimpan file hasil ke storage mock, dan menjadwalkan event via `after()` Next.js dengan fallback `setTimeout` untuk kompatibilitas standalone scripts / CLI.
  3. Pemrosesan event (`handleESignEvent`) memeriksa idempotensi (mengabaikan job `COMPLETED`/`FAILED`), mengunduh dokumen dari provider, menyimpannya ke storage aplikasi, dan memanggil transisi status atomik di `src/lib/workflow/pengadaan-workflow.ts` (T4, T7, T8) guna menjaga kepatuhan Aturan #3.
  4. Route `api/webhooks/esign` memvalidasi query parameter token `ESIGN_WEBHOOK_TOKEN`, mencatat payload audit di tabel `WebhookEvent`, dan mendelegasikan parsing ke provider.
- **Konsekuensi**: Kode aplikasi siap diuji end-to-end tanpa dependensi eksternal Mekari, seluruh transisi status terpusat di workflow, dan webhook route aman serta terisolasi.

### 2026-09-21 - Tanda Tangan TBIG, Dialog Konfirmasi, Auto-Refresh & Retry Workflow (Step 1.8)
- **Konteks**: Diperlukan implementasi UI dan workflow untuk aksi penandatanganan TBIG (T3), dialog konfirmasi, auto-refresh detail halaman saat dokumen dalam proses, serta penanganan kegagalan job provider dengan opsi "Coba lagi" (retry) sesuai PRD Bagian 5.2 dan 8.4.
- **Keputusan**:
  1. Aksi penandatanganan TBIG dipicu lewat komponen `SignTbigDialog` yang menampilkan modal konfirmasi sebelum menjalankan Server Action `signPengadaanAsTbigAction`.
  2. Fungsi workflow `submitTbigSign` diperluas untuk menangani dua kondisi: inisiasi awal dari status `DRAFT` (optimistic update ke `MENUNGGU_TTD_TBIG`), dan inisiasi ulang (retry) saat status `MENUNGGU_TTD_TBIG` dengan job `AUTO_SIGN_TBIG` berstatus `FAILED`, sehingga status pengadaan tetap stabil sesuai PRD 5.2.
  3. Dibuat komponen `AutoRefresh` berbasis `router.refresh()` dengan interval 3 detik, aktif secara selektif saat status `MENUNGGU_TTD_TBIG` atau `MENUNGGU_TTD_VENDOR` dan tidak ada kegagalan job.
  4. Pada kondisi kegagalan job (mis. `MOCK_ESIGN_FAIL`), halaman detail menampilkan banner error dan tombol `RetryTbigSignButton` ("Coba lagi").
- **Konsekuensi**: Alur tanda tangan TBIG berjalan interaktif, status terbarui otomatis tanpa reload manual, dan skenario kegagalan provider tertangani secara elegan.

### 2026-09-21 - Portal Vendor: Daftar, Detail, Visibilitas & Alur Penolakan T5 (Step 1.9)
- **Konteks**: Diperlukan portal vendor untuk meninjau pengadaan yang telah ditandatangani TBIG, aturan visibilitas dan proteksi multi-tenant ketat (PRD Bagian 7.4), serta alur penolakan dokumen oleh vendor (Transisi T5) dengan dialog alasan terkonfirmasi minimal 10 karakter.
- **Keputusan**:
  1. Halaman daftar vendor (`/vendor/pengadaan`) memfilter data dengan klausul `vendorId: user.vendorId` dan `status: { notIn: [DRAFT, MENUNGGU_TTD_TBIG] }`, memastikan vendor hanya melihat pengadaan miliknya yang sudah mencapai tahap `MENUNGGU_PERSETUJUAN_VENDOR` ke atas.
  2. Halaman detail vendor (`/vendor/pengadaan/[id]`) menerapkan proteksi 404 jika pengadaan bukan milik vendor yang login atau jika status masih `DRAFT`/`MENUNGGU_TTD_TBIG`.
  3. Pratinjau PDF di portal vendor memprioritaskan dokumen versi bertanda tangan (`FINAL` > `STAMPED_METERAI` > `SIGNED_TBIG`), sehingga vendor hanya menelaah dokumen yang sah dari TBIG.
  4. Transisi T5 diisolasi dalam fungsi workflow `rejectPengadaanByVendor` di `src/lib/workflow/pengadaan-workflow.ts`: memvalidasi alasan minimal 10 karakter, mengecek kepemilikan vendor dan status `MENUNGGU_PERSETUJUAN_VENDOR`, melakukan update atomik status `DITOLAK`, mencatat `alasanPenolakan` & timestamp `vendorRespondedAt`, serta merekam audit `ActivityLog`.
  5. UI penolakan menggunakan komponen client `RejectDialog` dengan indikator counter karakter real-time dan feedback validasi.
  6. Alasan penolakan ditampilkan transparan pada banner detail pengadaan di kedua sisi (portal Vendor dan portal TBIG).
- **Konsekuensi**: Proteksi data lintas vendor dan kerahasiaan draft internal TBIG terjamin, alur penolakan patuh terhadap aturan arsitektur workflow, dan komunikasi alasan penolakan terlihat jelas oleh kedua belah pihak.

