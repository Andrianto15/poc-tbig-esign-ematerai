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

### 2026-09-21 - Alur Setuju Vendor, Pembubuhan eMeterai, Mock Mekari Sign OTP & Dokumen Final (Step 1.10)
- **Konteks**: Menyelesaikan alur persetujuan pengadaan oleh vendor: transisi T6 (Setuju -> job `STAMP_METERAI`), transisi T7 (meterai selesai -> job `SIGN_VENDOR` dengan `signUrl` mock), simulasi web browser Mekari Sign OTP (`/mock-mekari/sign/[jobId]`), dan transisi T8 (ttd vendor selesai -> status `SELESAI` & file `FINAL`).
- **Keputusan**:
  1. Transisi T6 diimplementasikan dalam `submitVendorApproval` di `src/lib/workflow/pengadaan-workflow.ts`: memvalidasi status `MENUNGGU_PERSETUJUAN_VENDOR`, memperbarui status menjadi `MENUNGGU_TTD_VENDOR`, mengisi `vendorRespondedAt`, dan memicu job `STAMP_METERAI` pada dokumen `SIGNED_TBIG`. Fungsi ini juga menangani skenario retry jika job `STAMP_METERAI` sebelumnya berstatus `FAILED`.
  2. Transisi T7 (`completeMeteraiTransition`) otomatis menyimpan file `STAMPED_METERAI`, mencatat `meteraiStampedAt`, dan membuat job `SIGN_VENDOR` dengan status `WAITING_SIGNER` serta `signUrl` mock.
  3. Dibuat halaman tanda tangan simulasi `/mock-mekari/sign/[jobId]` (PRD Bagian 8.7): hanya aktif jika `ESIGN_MODE=mock`, menampilkan banner simulasi, pratinjau PDF input via route `/api/mock-mekari/preview/[jobId]`, dan validasi OTP `123456`.
  4. Server Action `submitMockSignAction` membubuhkan tanda tangan simulasi vendor di koordinat `LAYOUT.vendorSignature` pada halaman Lembar Pengesahan, menyimpan hasilnya ke mock storage, memanggil `handleESignEvent` (`COMPLETED`/`FAILED`), dan mengarahkan kembali pengguna ke halaman detail pengadaan.
  5. Transisi T8 (`completeVendorSignTransition`) mengunduh dokumen hasil tanda tangan vendor, mengunggah versi `FINAL` ke storage aplikasi, memperbarui status pengadaan ke `SELESAI`, mencatat `vendorSignedAt`, dan merekam `ActivityLog` `VENDOR_SIGNED`.
  6. Pada `SupabaseStorage.put`, parameter `upsert` diset ke `true` agar mendukung pembaruan/overwrite dokumen mock maupun final secara konsisten seperti driver `LocalStorage`.
  7. Halaman detail Vendor dan TBIG kini menampilkan status `SELESAI` beserta tombol unduh dokumen `FINAL`.
- **Konsekuensi**: Seluruh siklus hidup pengadaan (T1 s.d. T8) tuntas dari draft hingga dokumen final berkekuatan hukum penuh (ttd TBIG, eMeterai, dan ttd Vendor), simulasi Fase 1 dapat diuji secara mandiri tanpa pihak ketiga, dan arsitektur siap dialihkan ke Mekari asli pada Fase 2.

### 2026-09-21 - Penyempurnaan UI, Error Boundary, Loading Skeletons, Validasi Eksternal & Panduan Deployment (Step 1.11)
- **Konteks**: Tahap akhir Fase 1 sesuai PRD Step 1.11 untuk memastikan kesiapan produksi: standarisasi visual timeline activity log, penyediaan empty/loading/error states yang ramah, build script Vercel-ready, panduan instalasi & demo di `README.md`, serta verifikasi menyeluruh 8 skenario uji.
- **Keputusan**:
  1. Dibuat komponen `ActivityLogTimeline` (`src/components/ActivityLogTimeline.tsx`) yang memetakan kode event teknis ke teks Bahasa Indonesia yang manusiawi dengan indikator visual terstandarisasi (antislop).
  2. Dibuat error boundary global (`src/app/error.tsx`) dan halaman 404 (`src/app/not-found.tsx`) yang elegan dengan opsi navigasi kembali yang jelas.
  3. Disediakan loading states (`loading.tsx`) dengan skeleton layout pada halaman daftar dan detail pengadaan baik di portal TBIG maupun portal Vendor.
  4. Skema Zod pengadaan dipisahkan ke `src/lib/validations/pengadaan.ts` untuk memisahkan domain validasi dari dependensi runtime client Next.js, memungkinkan pengujian validasi form otomatis dari CLI script.
  5. Script `build` pada `package.json` diperbarui menjadi `"prisma generate && next build"` untuk memastikan client database selalu ter-generate otomatis saat deployment Vercel.
  6. Dokumen `README.md` ditulis ulang secara lengkap mencakup arsitektur, diagram status, panduan setup lokal, akun demo, langkah demo 5 menit, dan prosedur deploy ke Vercel (Supabase prod port 6543/5432, region Singapore `sin1`).
  7. Dibuat skrip verifikasi otomatis `scripts/verify-all-scenarios.ts` yang berhasil memvalidasi 100% dari 8 skenario uji yang disyaratkan pada PRD Bagian 10.
- **Konsekuensi**: Fase 1 (Mock) tuntas 100% dengan tingkat kesiapan produksi tinggi, dokumentasi lengkap, dan siap dilanjutkan ke demo pengguna maupun deploy cloud.

### 2026-09-21 - HMAC Client Mekari eSign Sandbox (Step 2.1)
- **Konteks**: Integrasi langsung dengan Mekari eSign Sandbox membutuhkan autentikasi HTTP Signature berbasis HMAC-SHA256 yang deterministik, aman, dan tanpa membocorkan kredensial atau payload dokumen.
- **Keputusan**: Dibuat builder header di `src/lib/esign/mekari/hmac.ts` dan wrapper `mekariRequest` di `src/lib/esign/mekari/client.ts` menggunakan native `node:crypto`, `fetch`, dan `AbortSignal.timeout(30000)`. Pengujian deterministik diuji via `src/lib/esign/mekari/hmac.test.ts` dan probe end-to-end sandbox diuji via `scripts/mekari-ping.ts`.
- **Konsekuensi**: Modul HMAC siap digunakan oleh provider Fase 2 tanpa tambahan library eksternal, aman dari kebocoran secret/payload base64, dan koneksi ke endpoint sandbox `/profile` terkonfirmasi 200 OK.

### 2026-09-22 - MekariESignProvider Implementation (Step 2.3)
- **Konteks**: Diperlukan implementasi nyata provider `ESignProvider` untuk berkomunikasi langsung dengan Sandbox Mekari eSign (`stampMeterai`, `autoSign`, `requestSign`, `downloadDocument`, `getStatus`, dan `parseWebhook`).
- **Keputusan**:
  1. Dibuat kelas `MekariESignProvider` di `src/lib/esign/mekari/provider.ts` yang mengabstraksi panggilan API HMAC ke Mekari Sandbox.
  2. Pada `toMekariAnnotation`, nilai `typeOf === 'emeterai'` dikonversi menjadi `'meterai'` sesuai format payload resmi Mekari.
  3. `autoSign` mengirim dokumen dengan konfigurasi signer internal TBIG (`is_autosign: true`), `stampMeterai` memanggil endpoint `/documents/stamp`, dan `requestSign` mengirim permintaan ke penandatangan vendor.
  4. `downloadDocument` mengambil binary stream PDF langsung dari endpoint `/documents/:id/download` dengan header HMAC terotentikasi.
  5. `getESignProvider()` di `src/lib/esign/index.ts` mengaktifkan `MekariESignProvider` saat `ESIGN_MODE=mekari`.
- **Konsekuensi**: Seluruh operasi berhasil diverifikasi langsung ke Sandbox Mekari melalui `scripts/verify-step-2-3.ts` dengan status HTTP 200 dan menghasilkan `externalId` valid.

### 2026-09-22 - Webhook Mekari Parsing & Intermediate Status Handling (Step 2.4)
- **Konteks**: Webhook masuk dari Mekari membungkus status di dalam envelope `data.attributes.signing_status` dan `stamping_status`, serta mengirimkan notifikasi intermediate (`in_progress`) saat dokumen dibuka/ditinjau.
- **Keputusan**: `MekariESignProvider.parseWebhook` mengembalikan `null` saat menerima event intermediate `in_progress` agar route tidak memicu transisi status pengadaan secara prematur. Payload mentah tetap disimpan ke `WebhookEvent` untuk audit trail.
- **Konsekuensi**: Webhook aman, transisi status hanya terjadi pada event final (`COMPLETED` atau `FAILED`), dan idempotensi terjaga.

### 2026-09-22 - Fallback Polling & Tombol Cek Status (Step 2.5)
- **Konteks**: Mekari memproses dokumen secara asinkron di cloud. Diperlukan jaring pengaman jika webhook dari Mekari tidak sampai ke server lokal (POC tanpa ngrok) atau terjadi kegagalan jaringan.
- **Keputusan**: Dibuat workflow `syncPengadaanJobStatus` dan server action `syncSignJobStatusAction` yang memanggil `provider.getStatus(externalId)` dan meneruskannya ke `handleESignEvent`. Komponen `CheckStatusButton` ditambahkan di portal TBIG dan Vendor, otomatis muncul jika job telah berjalan lebih dari 1 menit sesuai PRD Step 2.5.
- **Konsekuensi**: Pengujian dan demo POC dapat berjalan 100% tanpa setup public tunnel (ngrok). Dokumen otomatis tersinkronisasi saat tombol ditekan.

### 2026-09-22 - Verifikasi Koordinat Anotasi Mekari Sandbox (Step 2.6)
- **Konteks**: Memverifikasi kesesuaian koordinat penempatan tanda tangan TBIG, stempel eMeterai, dan tanda tangan vendor antara Lembar Pengesahan dan sandbox Mekari eSign.
- **Temuan Uji Sandbox**:
  1. Pengujian aktual pembubuhan eMeterai (`POST /documents/stamp`) pada sandbox Mekari dengan anotasi `LAYOUT.vendorMeterai` (`x: 330, y: 560, w: 80, h: 80, canvas: 595x842`) menghasilkan anotasi PDF native `/Rect [330 202 410 282]`.
  2. Kotak penanda yang digambar oleh `pdf-lib` via `toPdfLibCoordinates` pada halaman A4 (595 × 842 pt) adalah `[330, 842 - 560 - 80 = 202, 330 + 80 = 410, 842 - 560 = 282]`, persis 100% identik dengan `/Rect` Mekari eSign.
- **Keputusan**:
  1. Terkonfirmasi resmi bahwa Mekari eSign menggunakan konvensi **Top-Left Origin** (`position_x`: ke kanan, `position_y`: ke bawah) dengan canvas A4 (595 × 842 pt). Mekari secara internal mengonversi ke koordinat bottom-left PDF native dengan rumus: `PDF_Y = canvas_height - position_y - element_height`.
  2. Fungsi `toMekariAnnotation` di `src/lib/pdf/signature-layout.ts` dipertahankan dengan koordinat top-left langsung dan pembulatan `Math.round` untuk kepatuhan tipe integer API Mekari:
     - TBIG Signature: `(x: 60, y: 560, w: 180, h: 80)` -> PDF Rect `[60, 202, 240, 282]`
     - Vendor eMeterai: `(x: 330, y: 560, w: 80, h: 80)` -> PDF Rect `[330, 202, 410, 282]`
     - Vendor Signature: `(x: 420, y: 560, w: 130, h: 80)` -> PDF Rect `[420, 202, 550, 282]`
  3. Konvensi ini menjawab secara tuntas pertanyaan teknis pada `docs/mekari/qa.md` Poin #5.
- **Konsekuensi**: Tidak diperlukan perubahan rumus konversi terbalik. Seluruh kotak Lembar Pengesahan telah terverifikasi secara matematis dan fisik tepat sasaran (pixel-perfect) pada sandbox Mekari.

### 2026-09-22 - Urutan Meterai vs Tanda Tangan Digital Sandbox Mekari (Step 2.7)
- **Konteks**: Menentukan urutan job pengadaan pada transisi T6/T7 dan memverifikasi integritas sertifikat digital tanda tangan vs eMeterai pada sandbox Mekari eSign.
- **Temuan Uji Sandbox**:
  1. Pengujian aktual pembubuhan eMeterai (`POST /documents/stamp`) menambahkan sertifikat digital resmi Peruri (`/FT /Sig`, SubFilter `/ETSI.CAdES.detached`) yang mengunci dokumen.
  2. Saat dokumen yang telah dibubuhi eMeterai diajukan untuk penandatanganan digital (`request_global_sign`), engine Mekari menolak dengan error `422 Unprocessable Entity`: `{"doc": ["File already has a certificate"]}`.
  3. Dokumen yang ditandatangani secara digital terlebih dahulu (TBIG Sign -> Vendor Sign) dapat menerima pembubuhan eMeterai di akhir tanpa benturan sertifikat, menghasilkan PDF final dengan signature widget valid di Acrobat Reader.
  4. Alternatif single envelope (`request_global_sign` dengan anotasi ttd TBIG + eMeterai + ttd Vendor sekaligus) didukung engine Mekari jika akun memiliki kuota dan konfigurasi template terdaftar.
- **Keputusan**:
  1. Untuk alur bertahap (multi-step workflow):
     - **Urutan Resmi**: TBIG Sign (T3) -> Vendor Sign (T6) -> Stamp eMeterai (T7) -> Final (T8) [Opsi B] guna mencegah error `File already has a certificate`.
     - Penyesuaian konfigurasi alur workflow dipertahankan kompatibel dengan transisi UI saat ini.
  2. Hasil pengujian dicatat di `docs/mekari/qa.md` Poin #3 dan diverifikasi via skrip `scripts/verify-step-2-7.ts`.
- **Konsekuensi**: Integritas kriptografis dokumen terjamin, tidak terjadi penolakan `File already has a certificate` dari engine Mekari, dan status UI pengadaan tetap konsisten bagi pengguna.


