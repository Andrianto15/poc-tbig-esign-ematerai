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



