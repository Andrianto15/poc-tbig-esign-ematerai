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

