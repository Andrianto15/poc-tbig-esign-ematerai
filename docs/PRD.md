# PRD — PoC Pengadaan TBIG dengan Mekari eSign & eMeterai

> Dokumen ini ditujukan untuk dieksekusi oleh AI coding agent secara bertahap.
> Kerjakan **step by step sesuai urutan**. Jangan lompat ke step berikutnya sebelum
> acceptance criteria step saat ini terpenuhi.

---

## 0. Aturan untuk AI Agent

1. Kerjakan satu step per satu waktu. Setelah setiap step: jalankan `npm run lint`, `npm run typecheck`, dan (jika ada) test, lalu commit dengan pesan `step X.Y: <ringkasan>`.
2. Jangan pernah menulis kredensial (client secret, password DB, token) di kode. Semua lewat environment variable dan `.env.example`.
3. Semua perubahan status pengadaan **hanya** boleh dilakukan melalui modul workflow (`src/lib/workflow/`). Halaman, server action, dan webhook tidak boleh meng-update kolom `status` secara langsung.
4. Semua interaksi dengan penyedia tanda tangan **hanya** lewat interface `ESignProvider` (`src/lib/esign/`). Kode di luar folder itu tidak boleh tahu apakah yang dipakai mock atau Mekari.
5. Bahasa UI: Bahasa Indonesia. Bahasa kode (nama variabel/fungsi): Inggris, kecuali nama domain yang sudah ditetapkan di dokumen ini (mis. `Pengadaan`, `noSuratPesanan`).
6. Jika menemukan hal yang ambigu atau tidak tercakup, pilih solusi paling sederhana, lalu catat keputusan itu di `docs/DECISIONS.md`.
7. Jangan menambah fitur di luar scope (lihat bagian 2.3).

---

## 1. Latar Belakang

TBIG membutuhkan alur persetujuan dokumen pengadaan dengan vendor yang ditandatangani secara elektronik. PoC ini membuktikan bahwa:

- data pengadaan dan dokumennya bisa dikelola di aplikasi internal,
- penandatanganan TBIG, pembubuhan eMeterai, dan penandatanganan vendor bisa dijalankan dari aplikasi ini melalui API Mekari eSign,
- kedua pihak bisa memantau status dokumen dari aplikasi yang sama.

PoC dibagi dua fase:

- **Fase 1 — Mock:** seluruh alur berjalan end-to-end tanpa akun/kredensial Mekari. Penyedia tanda tangan disimulasikan.
- **Fase 2 — Mekari Sandbox:** adapter mock diganti dengan integrasi nyata ke Mekari eSign Sandbox (autentikasi HMAC).

---

## 2. Scope

### 2.1 Aktor

| Aktor | Deskripsi |
|---|---|
| User TBIG | Satu akun. Menginput pengadaan, mengunggah PDF, menandatangani sebagai TBIG, memantau status semua pengadaan. |
| Vendor | Beberapa akun (masing-masing terhubung ke satu entitas vendor). Hanya melihat pengadaan yang ditujukan ke vendornya. Bisa Setuju (bubuh meterai + tanda tangan) atau Tolak. |

Semua akun dibuat lewat **seed**. Tidak ada fitur registrasi.

### 2.2 Fitur dalam scope

1. Login/logout email + password, dengan pembatasan akses berdasarkan role.
2. TBIG: buat, lihat, edit (hanya status DRAFT), hapus (hanya status DRAFT) pengadaan.
3. TBIG: upload PDF dokumen pengadaan.
4. Sistem otomatis menambahkan halaman **Lembar Pengesahan** di akhir PDF.
5. TBIG: tanda tangan via Auto Sign (tanpa membuka halaman Mekari).
6. Vendor: lihat data + PDF, lalu **Tolak** (wajib alasan) atau **Setuju**.
7. Saat vendor Setuju: eMeterai dibubuhkan di dekat kotak ttd vendor, lalu vendor diarahkan ke proses tanda tangan.
8. Webhook untuk menerima hasil dari penyedia tanda tangan.
9. Halaman daftar & detail dengan status dokumen untuk kedua role.
10. Unduh PDF (versi terbaru yang tersedia, dan PDF final bila selesai).
11. Riwayat aktivitas (activity log) di halaman detail.

### 2.3 Di luar scope

- Registrasi, lupa password, multi-user TBIG, approval berjenjang.
- Notifikasi email dari aplikasi (di Fase 2 email hanya dikirim oleh Mekari).
- Edit/hapus pengadaan setelah dikirim untuk ditandatangani.
- Pemilihan posisi tanda tangan secara manual (posisi tetap di Lembar Pengesahan).
- OAuth2 Mekari (PoC hanya memakai HMAC).

---

## 3. Tech Stack

| Komponen | Pilihan |
|---|---|
| Framework | Next.js (App Router, versi stabil terbaru) + TypeScript |
| UI | Tailwind CSS (boleh + shadcn/ui) |
| Database | Supabase Postgres (project cloud, region Southeast Asia / Singapore). Dev: project Supabase terpisah, atau Supabase CLI lokal (opsional, butuh Docker) |
| ORM | Prisma (koneksi lewat Supavisor pooler Supabase) |
| Auth | Session cookie terenkripsi (`iron-session`) + `bcryptjs` |
| Validasi | `zod` |
| PDF | `pdf-lib` (menambah halaman, menggambar ttd/meterai simulasi) |
| Preview PDF | `<iframe>` / `<object>` ke route file yang terproteksi |
| Storage file | Adapter: filesystem lokal (dev, opsional) / Supabase Storage, bucket **private** (dev & deploy) |
| Deploy | Vercel |

---

## 4. Data Model

### 4.1 Prisma schema (acuan)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // Supavisor transaction pooler (port 6543), dipakai runtime
  directUrl = env("DIRECT_URL")   // Supavisor session pooler (port 5432), dipakai migrasi
}

enum Role {
  TBIG
  VENDOR
}

enum PengadaanStatus {
  DRAFT
  MENUNGGU_TTD_TBIG
  MENUNGGU_PERSETUJUAN_VENDOR
  MENUNGGU_TTD_VENDOR
  SELESAI
  DITOLAK
}

enum FileKind {
  ORIGINAL          // PDF yang diunggah user
  PREPARED          // ORIGINAL + Lembar Pengesahan
  SIGNED_TBIG       // setelah ttd TBIG
  STAMPED_METERAI   // setelah eMeterai dibubuhkan
  FINAL             // setelah ttd vendor
}

enum SignJobType {
  AUTO_SIGN_TBIG
  STAMP_METERAI
  SIGN_VENDOR
}

enum SignJobStatus {
  PENDING          // sudah dikirim ke provider, menunggu hasil
  WAITING_SIGNER   // menunggu penandatangan (khusus SIGN_VENDOR)
  COMPLETED
  FAILED
}

model Vendor {
  id         String      @id @default(cuid())
  nama       String
  alamat     String?
  picNama    String
  picJabatan String
  users      User[]
  pengadaan  Pengadaan[]
  createdAt  DateTime    @default(now())
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  nama         String
  role         Role
  vendorId     String?
  vendor       Vendor?  @relation(fields: [vendorId], references: [id])
  createdAt    DateTime @default(now())
}

model Pengadaan {
  id                   String          @id @default(cuid())
  namaPengadaan        String
  alamat               String
  harga                BigInt          // rupiah, tanpa desimal
  tanggalMulai         DateTime        // tanggal pengadaan (from)
  tanggalSelesai       DateTime        // tanggal pengadaan (to)
  noSuratPesanan       String          @unique
  tanggalPenyelesaian  DateTime
  vendorId             String
  vendor               Vendor          @relation(fields: [vendorId], references: [id])
  picNama              String
  picJabatan           String
  status               PengadaanStatus @default(DRAFT)
  alasanPenolakan      String?
  tbigSignedAt         DateTime?
  vendorRespondedAt    DateTime?
  meteraiStampedAt     DateTime?
  vendorSignedAt       DateTime?
  createdById          String
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt
  files                DocumentFile[]
  jobs                 SignJob[]
  logs                 ActivityLog[]
}

model DocumentFile {
  id          String    @id @default(cuid())
  pengadaanId String
  pengadaan   Pengadaan @relation(fields: [pengadaanId], references: [id], onDelete: Cascade)
  kind        FileKind
  storageKey  String
  sizeBytes   Int
  sha256      String
  createdAt   DateTime  @default(now())

  @@unique([pengadaanId, kind])
}

model SignJob {
  id             String        @id @default(cuid())
  pengadaanId    String
  pengadaan      Pengadaan     @relation(fields: [pengadaanId], references: [id], onDelete: Cascade)
  type           SignJobType
  status         SignJobStatus @default(PENDING)
  provider       String        // "mock" | "mekari"
  externalId     String?       @unique
  signUrl        String?
  inputFileKind  FileKind
  outputFileKind FileKind
  errorMessage   String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  completedAt    DateTime?
}

model WebhookEvent {
  id          String    @id @default(cuid())
  provider    String
  externalId  String?
  eventType   String?
  payload     Json
  processedAt DateTime?
  error       String?
  receivedAt  DateTime  @default(now())
}

model ActivityLog {
  id          String    @id @default(cuid())
  pengadaanId String
  pengadaan   Pengadaan @relation(fields: [pengadaanId], references: [id], onDelete: Cascade)
  actorId     String?   // null = sistem/webhook
  action      String
  note        String?
  createdAt   DateTime  @default(now())
}
```

Catatan koneksi Supabase:

- `DATABASE_URL` memakai **transaction pooler** (port `6543`) dengan parameter `?pgbouncer=true&connection_limit=1`. Ini wajib untuk lingkungan serverless (Vercel) supaya koneksi tidak habis.
- `DIRECT_URL` memakai **session pooler** (port `5432`) dan hanya dipakai `prisma migrate`. Hindari direct connection `db.<ref>.supabase.co` karena hanya mendukung IPv6 (kecuali add-on IPv4 aktif).
- Jika versi Prisma yang terpasang memindahkan konfigurasi URL dari `schema.prisma` ke `prisma.config.ts`, ikuti dokumentasi versi tersebut dengan tetap memakai dua env di atas, lalu catat di `docs/DECISIONS.md`.
- Semua akses **database** lewat Prisma di server. Aplikasi tidak memakai Supabase Auth maupun anon/publishable key.
- `@supabase/supabase-js` hanya dipakai **di server** untuk Supabase Storage, dengan secret key (`sb_secret_...`, atau `service_role` key pada project lama). Key ini tidak boleh di-import ke client component dan tidak boleh memakai prefix `NEXT_PUBLIC_`.

Catatan: `BigInt` tidak bisa langsung di-serialize ke JSON. Konversi ke `string` sebelum dikirim ke client component, dan format tampilan sebagai Rupiah (`Rp 1.250.000.000`).

### 4.2 Data seed

| Email | Password | Role | Keterangan |
|---|---|---|---|
| `tbig@poc.local` | `password123` | TBIG | Nama: "Admin Pengadaan TBIG" |
| `vendor1@poc.local` | `password123` | VENDOR | Vendor: "PT Contoh Konstruksi Satu" |
| `vendor2@poc.local` | `password123` | VENDOR | Vendor: "PT Contoh Teknik Dua" |

Email seed harus bisa di-override lewat env (`SEED_TBIG_EMAIL`, `SEED_VENDOR1_EMAIL`, `SEED_VENDOR2_EMAIL`) karena di Fase 2 email vendor harus alamat asli yang bisa menerima email dari Mekari.

---

## 5. Status & Transisi

### 5.1 Label status di UI

| Status | Label UI | Warna badge |
|---|---|---|
| `DRAFT` | Belum ditandatangani | abu-abu |
| `MENUNGGU_TTD_TBIG` | Proses tanda tangan TBIG | biru |
| `MENUNGGU_PERSETUJUAN_VENDOR` | Sudah ttd TBIG, menunggu persetujuan vendor | kuning |
| `MENUNGGU_TTD_VENDOR` | Disetujui vendor, menunggu ttd vendor | ungu |
| `SELESAI` | Sudah ttd vendor (selesai) | hijau |
| `DITOLAK` | Pengadaan ditolak | merah |

### 5.2 Tabel transisi

| # | Dari | Ke | Pemicu | Efek samping |
|---|---|---|---|---|
| T1 | (baru) | `DRAFT` | TBIG simpan form + upload PDF | Simpan `ORIGINAL`, generate `PREPARED` |
| T2 | `DRAFT` | `DRAFT` | TBIG edit | Jika PDF/data berubah, regenerate `PREPARED` |
| T3 | `DRAFT` | `MENUNGGU_TTD_TBIG` | TBIG klik "Tandatangani" | Buat `SignJob(AUTO_SIGN_TBIG)` dari `PREPARED` |
| T4 | `MENUNGGU_TTD_TBIG` | `MENUNGGU_PERSETUJUAN_VENDOR` | Event COMPLETED untuk job AUTO_SIGN_TBIG | Unduh & simpan `SIGNED_TBIG`, isi `tbigSignedAt` |
| T5 | `MENUNGGU_PERSETUJUAN_VENDOR` | `DITOLAK` | Vendor klik "Tolak" + alasan (min. 10 karakter) | Isi `alasanPenolakan`, `vendorRespondedAt` |
| T6 | `MENUNGGU_PERSETUJUAN_VENDOR` | `MENUNGGU_TTD_VENDOR` | Vendor klik "Setuju" | Isi `vendorRespondedAt`, buat `SignJob(STAMP_METERAI)` dari `SIGNED_TBIG` |
| T7 | `MENUNGGU_TTD_VENDOR` | `MENUNGGU_TTD_VENDOR` | Event COMPLETED untuk job STAMP_METERAI | Simpan `STAMPED_METERAI`, isi `meteraiStampedAt`, buat `SignJob(SIGN_VENDOR)` dari `STAMPED_METERAI`, simpan `signUrl` |
| T8 | `MENUNGGU_TTD_VENDOR` | `SELESAI` | Event COMPLETED untuk job SIGN_VENDOR | Simpan `FINAL`, isi `vendorSignedAt` |

**Kegagalan job:** jika event FAILED diterima atau pemanggilan provider error, `SignJob.status = FAILED` dan `errorMessage` diisi. Status pengadaan **tidak berubah**. UI menampilkan pesan error dan tombol "Coba lagi" (TBIG untuk AUTO_SIGN_TBIG; vendor untuk STAMP_METERAI/SIGN_VENDOR) yang membuat job baru dengan tipe sama.

**Aturan:**

- Setiap transisi yang tidak ada di tabel harus ditolak dengan error yang jelas.
- Setiap transisi mencatat `ActivityLog`.
- Transisi dijalankan di dalam transaksi Prisma, dengan pengecekan status saat ini (optimistic: `updateMany where { id, status: <status_asal> }` lalu cek `count === 1`).
- Event provider bersifat **idempoten**: jika job sudah `COMPLETED`, event duplikat diabaikan (tetap dicatat di `WebhookEvent`).

---

## 6. Lembar Pengesahan

### 6.1 Konten

Halaman A4 (595 × 842 pt) yang ditambahkan di akhir PDF, berisi:

1. Judul: **LEMBAR PENGESAHAN**
2. Subjudul: No. Surat Pesanan
3. Tabel data: Nama Pengadaan, Alamat, Harga (Rupiah), Periode Pengadaan (tgl mulai s.d. tgl selesai), Tanggal Penyelesaian, Nama Vendor, PIC Vendor, Jabatan PIC.
4. Dua kolom tanda tangan:
   - Kiri: "Pihak Pertama — TBIG", kotak ttd TBIG, nama penandatangan TBIG.
   - Kanan: "Pihak Kedua — {nama vendor}", kotak eMeterai + kotak ttd vendor, nama PIC dan jabatan.
5. Footer kecil: ID pengadaan dan tanggal dokumen dibuat.

Kotak ttd/meterai digambar sebagai area kosong (boleh garis putus-putus tipis sebagai penanda) agar tidak menimpa konten.

### 6.2 Koordinat (single source of truth)

Semua koordinat disimpan di `src/lib/pdf/signature-layout.ts` dalam sistem **top-left origin** (x ke kanan, y ke bawah), satuan point, halaman A4 595 × 842.

```ts
export const PAGE = { width: 595, height: 842 };

export const LAYOUT = {
  tbigSignature:   { x: 60,  y: 560, width: 180, height: 80 },
  vendorMeterai:   { x: 330, y: 560, width: 80,  height: 80 },
  vendorSignature: { x: 420, y: 560, width: 130, height: 80 },
} as const;
```

- `pdf-lib` memakai origin bottom-left, jadi saat menggambar: `yPdfLib = PAGE.height - y - height`.
- Nomor halaman target selalu = halaman terakhir (halaman Lembar Pengesahan), 1-indexed saat dikirim ke Mekari.
- Buat helper `toMekariAnnotation(box, pageNumber, typeOf)` yang menghasilkan objek annotation Mekari (`page`, `position_x`, `position_y`, `element_width`, `element_height`, `canvas_width`, `canvas_height`, `type_of`). Konvensi origin Mekari **diverifikasi di Fase 2** (step 2.6); jangan diubah di Fase 1.

---

## 7. Arsitektur Aplikasi

### 7.1 Struktur folder

```
prisma/
  schema.prisma
  seed.ts
src/
  app/
    login/page.tsx
    (tbig)/tbig/pengadaan/page.tsx               # daftar
    (tbig)/tbig/pengadaan/baru/page.tsx          # form create
    (tbig)/tbig/pengadaan/[id]/page.tsx          # detail
    (tbig)/tbig/pengadaan/[id]/edit/page.tsx     # edit (DRAFT)
    (vendor)/vendor/pengadaan/page.tsx           # daftar milik vendor
    (vendor)/vendor/pengadaan/[id]/page.tsx      # detail + Setuju/Tolak
    mock-mekari/sign/[jobId]/page.tsx            # HANYA aktif di mode mock
    api/files/[fileId]/route.ts                  # stream PDF dengan cek akses
    api/webhooks/esign/route.ts                  # webhook provider
  lib/
    auth/            # session, getCurrentUser, requireRole
    db.ts            # Prisma client singleton
    storage/         # interface + local + supabase
    pdf/
      signature-layout.ts
      lembar-pengesahan.ts
      stamp-simulation.ts   # gambar ttd/meterai simulasi (mock)
    esign/
      types.ts       # ESignProvider interface + tipe event
      index.ts       # factory getESignProvider() berdasarkan ESIGN_MODE
      mock/          # MockESignProvider
      mekari/        # (Fase 2) hmac.ts, client.ts, provider.ts
    workflow/
      pengadaan-workflow.ts   # semua transisi status
      handle-esign-event.ts   # pemrosesan event dari provider
  middleware.ts      # proteksi route berdasarkan role
docs/
  DECISIONS.md
  mekari/            # (Fase 2) koleksi Postman + endpoint-map.md
```

### 7.2 Interface ESignProvider

```ts
// src/lib/esign/types.ts
export type Box = { x: number; y: number; width: number; height: number };

export interface Signer { name: string; email: string }

export interface AutoSignInput {
  jobId: string;
  pdf: Uint8Array;
  filename: string;
  page: number;
  box: Box;
  callbackUrl: string;
}

export interface StampMeteraiInput {
  jobId: string;
  pdf: Uint8Array;
  filename: string;
  page: number;
  box: Box;
  callbackUrl: string;
}

export interface RequestSignInput {
  jobId: string;
  pdf: Uint8Array;
  filename: string;
  signer: Signer;
  page: number;
  box: Box;
  callbackUrl: string;
  returnUrl: string; // ke halaman detail vendor
}

export interface SubmitResult {
  externalId: string;
  signUrl?: string; // hanya requestSign, jika provider menyediakan
}

export type ESignEvent = {
  provider: "mock" | "mekari";
  externalId: string;
  type: "COMPLETED" | "FAILED";
  errorMessage?: string;
  raw: unknown;
};

export interface ESignProvider {
  name: "mock" | "mekari";
  autoSign(input: AutoSignInput): Promise<SubmitResult>;
  stampMeterai(input: StampMeteraiInput): Promise<SubmitResult>;
  requestSign(input: RequestSignInput): Promise<SubmitResult>;
  downloadDocument(externalId: string): Promise<Uint8Array>;
  parseWebhook(req: Request): Promise<ESignEvent>;   // termasuk verifikasi keaslian
  getStatus?(externalId: string): Promise<ESignEvent | null>; // fallback polling
}
```

### 7.3 Alur pemrosesan event

`handleESignEvent(event)` di `src/lib/workflow/handle-esign-event.ts`:

1. Cari `SignJob` berdasarkan `externalId`. Jika tidak ada, catat error di `WebhookEvent` dan keluar.
2. Jika job sudah `COMPLETED`/`FAILED`, abaikan (idempoten).
3. Jika `FAILED`: tandai job gagal, catat log.
4. Jika `COMPLETED`: `provider.downloadDocument(externalId)`, simpan ke storage sebagai `outputFileKind`, tandai job selesai, lalu panggil transisi yang sesuai (T4 / T7 / T8).

Route `api/webhooks/esign` hanya: simpan payload mentah ke `WebhookEvent` → `provider.parseWebhook` → `handleESignEvent` → update `processedAt`/`error` → balas `200` (balas `401` jika verifikasi gagal).

### 7.4 Keamanan & akses

- `middleware.ts`: `/tbig/*` hanya role TBIG, `/vendor/*` hanya role VENDOR, sisanya redirect ke `/login`.
- Detail vendor: pengadaan harus milik `user.vendorId`; jika tidak → 404.
- Vendor tidak boleh melihat pengadaan berstatus `DRAFT` atau `MENUNGGU_TTD_TBIG`.
- `api/files/[fileId]`: cek akses dengan aturan yang sama, lalu server mengunduh file dari Supabase Storage dan men-stream-nya ke browser. Bucket bersifat **private**, tanpa policy di `storage.objects`, sehingga hanya server (secret key) yang bisa membaca/menulis. Jangan memakai public URL, dan jangan membagikan signed URL ke client.
- Upload: hanya `application/pdf`, cek magic bytes `%PDF`, maksimal 10 MB.
- **Row Level Security (RLS) Supabase:** tabel di schema `public` otomatis terekspos lewat Data API Supabase. Aktifkan RLS di **semua** tabel tanpa membuat policy apa pun, sehingga akses lewat Data API/anon key tertutup total. Prisma tetap bisa mengakses karena terhubung sebagai role `postgres` yang mem-bypass RLS. Pastikan Security Advisor di dashboard Supabase tidak menampilkan peringatan "RLS disabled".
- Callback URL berisi token rahasia: `${APP_BASE_URL}/api/webhooks/esign?token=${ESIGN_WEBHOOK_TOKEN}`; webhook menolak token yang salah (sebagai lapisan tambahan di atas verifikasi provider).

### 7.5 Environment variables

```bash
# .env.example
# Supabase: Dashboard > Project > Connect > ORMs (Prisma)
# Runtime: transaction pooler (port 6543)
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
# Migrasi: session pooler (port 5432)
DIRECT_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
# Jika memakai Supabase CLI lokal, keduanya:
# postgresql://postgres:postgres@127.0.0.1:54322/postgres

SESSION_SECRET=ganti-dengan-string-acak-minimal-32-karakter
APP_BASE_URL=http://localhost:3000

STORAGE_DRIVER=supabase         # supabase | local
LOCAL_STORAGE_DIR=./.storage    # hanya jika STORAGE_DRIVER=local

# Supabase: Dashboard > Project Settings > API Keys (server-only, JANGAN pakai prefix NEXT_PUBLIC_)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxx
SUPABASE_STORAGE_BUCKET=pengadaan-docs

ESIGN_MODE=mock                 # mock | mekari
ESIGN_WEBHOOK_TOKEN=ganti-dengan-string-acak
MOCK_ESIGN_DELAY_MS=2000

SEED_TBIG_EMAIL=tbig@poc.local
SEED_VENDOR1_EMAIL=vendor1@poc.local
SEED_VENDOR2_EMAIL=vendor2@poc.local
SEED_PASSWORD=password123

# Fase 2
MEKARI_BASE_URL=https://sandbox-api.mekari.com
MEKARI_ESIGN_PATH_PREFIX=/v2/esign-hmac/v1
MEKARI_CLIENT_ID=
MEKARI_CLIENT_SECRET=
```

---

## 8. Halaman & Perilaku UI

### 8.1 Login (`/login`)
Form email + password. Setelah login: TBIG → `/tbig/pengadaan`, Vendor → `/vendor/pengadaan`. Pesan error umum ("Email atau password salah").

### 8.2 TBIG — Daftar (`/tbig/pengadaan`)
Tabel: No. Surat Pesanan, Nama Pengadaan, Nama Vendor, Harga, Status (badge), Terakhir diperbarui. Filter status (dropdown). Tombol "Buat Pengadaan".

### 8.3 TBIG — Form Buat/Edit
Field (semua wajib):

| Field | Tipe | Validasi |
|---|---|---|
| Nama Pengadaan | text | 3–200 karakter |
| Alamat | textarea | 5–500 karakter |
| Harga Pengadaan | number (Rupiah) | > 0, bilangan bulat |
| Tanggal Pengadaan (dari) | date | — |
| Tanggal Pengadaan (sampai) | date | ≥ tanggal dari |
| No. Surat Pesanan | text | unik |
| Tanggal Penyelesaian | date | ≥ tanggal pengadaan (dari) |
| Vendor | select (dari tabel Vendor) | wajib |
| PIC Vendor | text | default terisi dari vendor terpilih, bisa diubah |
| Jabatan PIC | text | default terisi dari vendor terpilih, bisa diubah |
| Dokumen PDF | file | PDF, ≤ 10 MB (opsional saat edit) |

Saat simpan → T1/T2, redirect ke detail.

### 8.4 TBIG — Detail (`/tbig/pengadaan/[id]`)
- Kartu data pengadaan + badge status.
- Preview PDF versi terbaru (urutan prioritas: FINAL > STAMPED_METERAI > SIGNED_TBIG > PREPARED) + tombol unduh.
- Tombol sesuai status:
  - `DRAFT`: "Edit", "Hapus", "Tandatangani sebagai TBIG" (dengan dialog konfirmasi).
  - Job gagal: pesan error + "Coba lagi".
- Jika `DITOLAK`: tampilkan alasan penolakan.
- Timeline activity log.
- Jika status sedang diproses (`MENUNGGU_TTD_TBIG`, `MENUNGGU_TTD_VENDOR`): auto-refresh setiap 3 detik (`router.refresh()`).

### 8.5 Vendor — Daftar (`/vendor/pengadaan`)
Tabel pengadaan milik vendor (status ≥ `MENUNGGU_PERSETUJUAN_VENDOR`): No. SP, Nama Pengadaan, Harga, Status.

### 8.6 Vendor — Detail (`/vendor/pengadaan/[id]`)
- Data pengadaan + preview PDF (versi yang sudah ditandatangani TBIG atau lebih baru).
- Status `MENUNGGU_PERSETUJUAN_VENDOR`: tombol **Setuju** dan **Tolak**.
  - Tolak → dialog alasan (min. 10 karakter) → T5.
  - Setuju → dialog konfirmasi ("Dokumen akan dibubuhi eMeterai lalu Anda akan diarahkan ke proses tanda tangan") → T6.
- Status `MENUNGGU_TTD_VENDOR`:
  - Job meterai masih proses → "Sedang membubuhkan eMeterai…" (auto-refresh).
  - Job SIGN_VENDOR `WAITING_SIGNER` dengan `signUrl` → tombol **Lanjutkan Tanda Tangan** (buka `signUrl`).
  - Job SIGN_VENDOR tanpa `signUrl` (Fase 2, jika Mekari hanya mengirim email) → pesan "Silakan cek email Anda dari Mekari Sign untuk menandatangani."
- Status `SELESAI`: unduh PDF final.

### 8.7 Mock Mekari — Halaman Tanda Tangan (`/mock-mekari/sign/[jobId]`)
Hanya aktif jika `ESIGN_MODE=mock` (selain itu 404). Meniru halaman Mekari:
- Banner "SIMULASI — bukan Mekari Sign asli".
- Preview dokumen, input OTP (terima `123456`), tombol "Tanda Tangani".
- Setelah sukses → mock menghasilkan dokumen bertanda tangan, mengirim event COMPLETED, redirect ke `returnUrl`.

---

## 9. Perilaku Mock Provider (Fase 1)

`MockESignProvider` menyimpan dokumen hasil di storage dengan key `mock/{externalId}.pdf`.

| Method | Perilaku |
|---|---|
| `autoSign` | Gambar ttd simulasi di box TBIG → simpan hasil → jadwalkan event COMPLETED setelah `MOCK_ESIGN_DELAY_MS` |
| `stampMeterai` | Gambar meterai simulasi di box meterai → simpan → jadwalkan event COMPLETED |
| `requestSign` | Simpan PDF input + metadata → kembalikan `signUrl = ${APP_BASE_URL}/mock-mekari/sign/{jobId}`. Tidak ada event sampai signer menandatangani di halaman mock |
| `downloadDocument` | Baca `mock/{externalId}.pdf` |
| `parseWebhook` | Tidak dipakai jalur utama (event mock memanggil `handleESignEvent` langsung), tapi tetap diimplementasikan agar route webhook bisa dites manual |

Detail:
- "Menjadwalkan event" dilakukan dengan `after()` dari `next/server` (jalankan setelah response dikirim, tunggu delay, lalu panggil `handleESignEvent`). Jika `after()` tidak tersedia, panggil langsung secara sinkron setelah delay.
- Ttd simulasi: kotak berisi teks "Ditandatangani secara elektronik", nama penandatangan, timestamp, dan tulisan "SIMULASI".
- Meterai simulasi: kotak berwarna dengan teks "e-METERAI SIMULASI 10000" dan nomor seri acak.
- Tambahkan watermark diagonal tipis "SIMULASI" di halaman Lembar Pengesahan pada setiap dokumen hasil mock.
- Env `MOCK_ESIGN_FAIL=AUTO_SIGN_TBIG|STAMP_METERAI|SIGN_VENDOR` (opsional) memaksa job tipe tersebut gagal, untuk menguji alur "Coba lagi".

---

# FASE 1 — Mock (tanpa akun Mekari)

### Step 1.1 — Inisialisasi project
- Buat project Next.js + TypeScript + Tailwind + ESLint.
- Tambahkan script `lint`, `typecheck` (`tsc --noEmit`), `db:migrate` (`prisma migrate dev`), `db:deploy` (`prisma migrate deploy`), `db:seed`.
- Buat `.env.example` (bagian 7.5) dan `docs/DECISIONS.md`.
- **Prasyarat manusia:** buat project Supabase (region Southeast Asia / Singapore), simpan database password, lalu salin connection string Prisma dari menu *Connect* ke `.env` sebagai `DATABASE_URL` dan `DIRECT_URL`. Disarankan dua project: `poc-pengadaan-dev` dan `poc-pengadaan-prod`.
- (Opsional) Jika ingin database lokal: `npx supabase init` + `npx supabase start` (butuh Docker), lalu pakai URL lokal di `.env`.

**Selesai jika:** `npm run dev` menampilkan halaman awal; lint & typecheck lolos; `npx prisma db pull` (atau skrip cek koneksi sederhana) berhasil terhubung ke Supabase.

### Step 1.2 — Database & seed
- Tulis `prisma/schema.prisma` sesuai bagian 4.1, jalankan `npm run db:migrate`.
- Buat migrasi SQL tambahan (`prisma migrate dev --create-only --name enable_rls`) yang menjalankan `ALTER TABLE "<nama_tabel>" ENABLE ROW LEVEL SECURITY;` untuk setiap tabel (termasuk `_prisma_migrations`), lalu terapkan. Setiap tabel baru di kemudian hari juga wajib diaktifkan RLS-nya.
- Tulis `prisma/seed.ts` sesuai bagian 4.2 (idempoten: upsert berdasarkan email/nama).

**Selesai jika:** `npm run db:seed` dua kali berturut-turut tidak error dan tidak menduplikasi data; tabel terlihat di Table Editor Supabase dengan label RLS aktif; Security Advisor tidak menampilkan peringatan RLS.

### Step 1.3 — Autentikasi & proteksi route
- Session dengan `iron-session`, login via server action, logout.
- Helper `getCurrentUser()`, `requireRole(role)`.
- `middleware.ts` sesuai bagian 7.4.
- Layout dasar per role (header: nama user, role, tombol logout).

**Selesai jika:** login ketiga akun seed berhasil dan diarahkan ke halaman yang benar; vendor membuka `/tbig/...` → ditolak; tanpa login → ke `/login`.

### Step 1.4 — Storage adapter & route file
- Interface `Storage { put(key, bytes, contentType), get(key), delete(key) }`.
- Implementasi `SupabaseStorage` (default) dan `LocalStorage` (folder `LOCAL_STORAGE_DIR`, untuk dev tanpa internet; tambahkan `.storage/` ke `.gitignore`). `LocalStorage` tidak boleh dipakai di Vercel karena filesystem-nya read-only.
- `SupabaseStorage` memakai client `@supabase/supabase-js` yang dibuat di `src/lib/storage/supabase.ts` dengan `import "server-only"` di baris pertama, `auth: { persistSession: false }`, dan `upsert: false` saat upload.
- Konvensi key: `pengadaan/{pengadaanId}/{fileKind}-{timestamp}.pdf` dan `mock/{externalId}.pdf`.
- Script idempoten `scripts/setup-storage.ts` (`npm run storage:setup`): buat bucket `SUPABASE_STORAGE_BUCKET` jika belum ada dengan `public: false`, `fileSizeLimit: 10MB`, `allowedMimeTypes: ["application/pdf"]`.
- Route `api/files/[fileId]` dengan cek akses (bagian 7.4), header `Content-Type: application/pdf`, `Content-Disposition: inline`.

**Selesai jika:** `npm run storage:setup` dua kali tidak error dan bucket terlihat private di dashboard; skrip uji put/get/delete ke Supabase Storage berhasil; membuka URL publik objek (`/storage/v1/object/public/...`) gagal; akses file milik vendor lain lewat `api/files/[fileId]` → 404.

### Step 1.5 — Generator Lembar Pengesahan
- `signature-layout.ts` (bagian 6.2) dan `lembar-pengesahan.ts`: input PDF bytes + data pengadaan → output PDF dengan halaman tambahan.
- Script `scripts/preview-lembar.ts` yang menghasilkan contoh PDF ke `./.tmp/` untuk dicek visual, termasuk garis bantu box.

**Selesai jika:** PDF contoh terbuka normal, halaman terakhir berisi data lengkap, dan tiga kotak (ttd TBIG, meterai, ttd vendor) berada di posisi sesuai layout dan tidak menimpa teks.

### Step 1.6 — CRUD pengadaan (TBIG)
- Halaman daftar, buat, edit, detail (tanpa tombol tanda tangan dulu), hapus.
- Validasi `zod` sesuai bagian 8.3 (di server; boleh juga di client).
- T1/T2 lewat `pengadaan-workflow.ts`, termasuk simpan `ORIGINAL` + `PREPARED` dan activity log.

**Selesai jika:** TBIG bisa membuat pengadaan dengan PDF, melihat preview PDF yang sudah berisi Lembar Pengesahan, mengedit, dan menghapus draft. No. SP duplikat ditolak dengan pesan jelas.

### Step 1.7 — ESignProvider interface & Mock provider
- `types.ts` (bagian 7.2), factory `getESignProvider()`.
- `MockESignProvider` sesuai bagian 9 beserta `stamp-simulation.ts`.
- `handle-esign-event.ts` (bagian 7.3) dan route `api/webhooks/esign`.

**Selesai jika:** test/skrip memanggil `autoSign` pada PDF contoh → setelah delay, `handleESignEvent` terpanggil, dan file hasil terlihat bertanda tangan simulasi di posisi yang benar.

### Step 1.8 — Tanda tangan TBIG
- Tombol "Tandatangani sebagai TBIG" di detail → T3.
- Tangani T4 via event.
- Auto-refresh detail selama `MENUNGGU_TTD_TBIG`.
- Tampilan job gagal + "Coba lagi".

**Selesai jika:** klik tanda tangan → status berubah ke "Proses tanda tangan TBIG" → beberapa detik kemudian menjadi "Sudah ttd TBIG, menunggu persetujuan vendor" dan preview menampilkan ttd TBIG. Dengan `MOCK_ESIGN_FAIL=AUTO_SIGN_TBIG`, error tampil dan "Coba lagi" berfungsi setelah env dihapus.

### Step 1.9 — Halaman vendor: daftar, detail, Tolak
- Daftar & detail vendor dengan aturan visibilitas (bagian 7.4).
- Tombol Tolak + dialog alasan → T5.
- Detail TBIG menampilkan alasan penolakan.

**Selesai jika:** vendor1 hanya melihat pengadaan miliknya yang sudah ditandatangani TBIG; penolakan mengubah status di kedua sisi menjadi "Pengadaan ditolak" dengan alasan tampil.

### Step 1.10 — Setuju: eMeterai + tanda tangan vendor
- Tombol Setuju → T6 → job STAMP_METERAI.
- Event meterai → T7 → job SIGN_VENDOR dengan `signUrl` mock.
- Halaman `/mock-mekari/sign/[jobId]` (bagian 8.7).
- Event ttd vendor → T8.

**Selesai jika:** vendor klik Setuju → "Sedang membubuhkan eMeterai…" → tombol "Lanjutkan Tanda Tangan" muncul → OTP `123456` → kembali ke detail dengan status "Sudah ttd vendor (selesai)". PDF final berisi ttd TBIG, meterai, dan ttd vendor di posisi yang benar. Halaman TBIG menampilkan status yang sama.

### Step 1.11 — Penyempurnaan & deploy
- Activity log timeline di kedua detail.
- Empty state, loading state, pesan error yang ramah.
- `README.md`: cara setup lokal, seed, akun demo, skenario demo.
- Deploy ke Vercel dengan Supabase project prod (database + Storage, `STORAGE_DRIVER=supabase`):
  - Isi semua env di Vercel Project Settings, termasuk `DATABASE_URL` (port 6543) dan `DIRECT_URL` (port 5432) milik project Supabase prod.
  - Set region Vercel Functions ke Singapore (`sin1`) agar dekat dengan database Supabase.
  - Tambahkan `prisma generate` ke build (`"build": "prisma generate && next build"`, atau `postinstall`).
  - Jalankan `npm run db:deploy`, `npm run db:seed`, dan `npm run storage:setup` ke project prod dari lokal (dengan env prod), bukan saat build.
  - Catatan Free plan Supabase: project di-pause setelah 1 minggu tidak aktif. Buka aplikasi atau dashboard sehari sebelum demo; jika ter-pause, klik *Restore* di dashboard.

**Selesai jika:** seluruh skenario uji (bagian 10) lolos di URL Vercel.

---

# FASE 2 — Integrasi Mekari eSign Sandbox

Referensi dokumentasi:
- eSign Open API (Postman): https://documenter.getpostman.com/view/21582074/2s93K1oecc
- HMAC Authentication: https://sandbox-developers.mekari.com/docs/kb/hmac-authentication
- Contoh HMAC Node.js: https://sandbox-developers.mekari.com/docs/kb/hmac-authentication/node

Base URL sandbox HMAC: `https://sandbox-api.mekari.com/v2/esign-hmac/v1`

### Step 2.0 — Prasyarat (dikerjakan manusia, bukan agent)
- [ ] Kredensial HMAC sandbox (client ID & secret) dari Mekari Developer Center / tim Mekari.
- [ ] Akun TBIG di sandbox Mekari Sign sudah di-setup untuk **Auto Sign** (eKYC + spesimen tanda tangan).
- [ ] Kuota eMeterai dan eKYC sandbox tersedia.
- [ ] Email vendor untuk testing adalah email asli yang bisa diakses (isi `SEED_VENDOR1_EMAIL`, lalu seed ulang).
- [ ] Jawaban Mekari untuk pertanyaan berikut dicatat di `docs/mekari/qa.md`:
  1. Apakah Auto Sign tersedia lewat HMAC? Endpoint dan syarat setup-nya?
  2. Apakah request tanda tangan untuk signer eksternal mengembalikan **signing URL**, atau hanya mengirim email?
  3. Urutan yang benar antara eMeterai dan tanda tangan digital pada satu dokumen (meterai dulu atau ttd dulu), agar tidak merusak validitas?
  4. Format payload callback/webhook dan cara memverifikasi keasliannya?
  5. Konvensi koordinat annotation (origin top-left atau bottom-left? satuan?).
  6. Tanda tangan tersertifikasi (PSrE) atau tidak untuk kasus ini?
- [ ] Ekspor koleksi Postman eSign (format Collection v2.1 JSON) dan simpan di `docs/mekari/esign-collection.json` agar agent bisa membaca endpoint lengkap.

### Step 2.1 — HMAC client
Buat `src/lib/esign/mekari/hmac.ts` dan `client.ts`.

```ts
import crypto from "node:crypto";

export function buildHmacHeaders(method: string, pathWithQuery: string) {
  const date = new Date().toUTCString();
  const requestLine = `${method.toUpperCase()} ${pathWithQuery} HTTP/1.1`;
  const payload = `date: ${date}\n${requestLine}`;
  const signature = crypto
    .createHmac("sha256", process.env.MEKARI_CLIENT_SECRET!)
    .update(payload)
    .digest("base64");

  return {
    Date: date,
    Authorization:
      `hmac username="${process.env.MEKARI_CLIENT_ID}", ` +
      `algorithm="hmac-sha256", headers="date request-line", ` +
      `signature="${signature}"`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
```

Aturan penting:
- `pathWithQuery` yang di-sign harus path **lengkap** termasuk prefix, mis. `/v2/esign-hmac/v1/profile?x=1`, bukan hanya `/profile`.
- Header `Date` yang dikirim harus identik dengan yang di-sign.
- `client.ts`: fungsi `mekariRequest(method, path, body?)` yang membangun URL dari `MEKARI_BASE_URL + MEKARI_ESIGN_PATH_PREFIX + path`, menambah header HMAC, timeout 30 detik, dan melempar error berisi status + body respons. Jangan log client secret atau isi dokumen base64.
- Unit test: dengan date tetap dan secret dummy, signature yang dihasilkan deterministik.

**Selesai jika:** `scripts/mekari-ping.ts` memanggil `GET /profile` di sandbox dan mengembalikan 200.

### Step 2.2 — Pemetaan endpoint
Baca `docs/mekari/esign-collection.json` dan `docs/mekari/qa.md`, lalu buat `docs/mekari/endpoint-map.md`:

| Kebutuhan | Method & path Mekari | Body penting | Response penting (id dokumen, signing URL) |
|---|---|---|---|
| Auto Sign TBIG | | | |
| Stamp eMeterai | | | |
| Request tanda tangan signer eksternal | | | |
| Cek status dokumen | | | |
| Unduh dokumen hasil | | | |

Catatan: dokumen dikirim sebagai base64 (`doc`) + `filename`; annotation berisi `page`, `position_x`, `position_y`, `element_width`, `element_height`, `canvas_width`, `canvas_height`, `type_of`, plus `callback_url`. Isi tabel hanya dari sumber resmi di atas; bila ada yang tidak jelas, tandai "PERLU KONFIRMASI" dan jangan menebak.

**Selesai jika:** semua baris terisi atau ditandai perlu konfirmasi, dan sudah direview manusia.

### Step 2.3 — MekariESignProvider
Implementasikan `src/lib/esign/mekari/provider.ts` sesuai `ESignProvider`:
- `autoSign`, `stampMeterai`, `requestSign`: kirim request sesuai endpoint-map, kembalikan `externalId` (id dokumen Mekari) dan `signUrl` bila ada.
- `downloadDocument`: ambil file hasil (dari endpoint unduh atau URL di response status) → `Uint8Array`.
- `getStatus`: panggil endpoint status, petakan ke `ESignEvent` (COMPLETED/FAILED/null jika masih proses).
- Aktifkan lewat `ESIGN_MODE=mekari`. Halaman `/mock-mekari/*` otomatis 404 di mode ini.

**Selesai jika:** test integrasi manual (skrip) berhasil mengirim PDF contoh ke sandbox untuk masing-masing dari tiga operasi dan mendapat `externalId`.

### Step 2.4 — Webhook dari Mekari
- Callback URL: `${APP_BASE_URL}/api/webhooks/esign?token=${ESIGN_WEBHOOK_TOKEN}`. `APP_BASE_URL` harus URL publik HTTPS (deploy preview Vercel, atau ngrok/cloudflared untuk lokal).
- `parseWebhook`: validasi token, verifikasi keaslian sesuai jawaban Mekari (qa.md #4), petakan payload ke `ESignEvent`.
- Semua payload mentah tetap disimpan di `WebhookEvent` sebelum diproses, untuk debugging.

**Selesai jika:** callback nyata dari sandbox tercatat di `WebhookEvent` dan diproses menjadi transisi yang benar.

### Step 2.5 — Fallback polling
Tambahkan tombol "Cek status ke Mekari" di detail (muncul jika job `PENDING`/`WAITING_SIGNER` lebih dari 1 menit) yang memanggil `provider.getStatus` lalu `handleESignEvent`. Ini jaring pengaman jika webhook tidak sampai.

**Selesai jika:** dengan webhook sengaja dimatikan (token salah), status tetap bisa diperbarui lewat tombol ini.

### Step 2.6 — Verifikasi koordinat
- Kirim PDF contoh ke sandbox untuk ketiga operasi, unduh hasilnya, cek visual posisi ttd dan meterai.
- Sesuaikan **hanya** fungsi `toMekariAnnotation` (konversi origin/skala), bukan `LAYOUT`.
- Catat konvensi final di `docs/DECISIONS.md`.

**Selesai jika:** ttd TBIG, meterai, dan ttd vendor mendarat tepat di kotak Lembar Pengesahan.

### Step 2.7 — Urutan meterai vs tanda tangan
Sesuaikan urutan job di workflow T6/T7 berdasarkan jawaban Mekari (qa.md #3):
- **Default (saat ini):** meterai dulu → ttd vendor.
- Jika Mekari mensyaratkan urutan lain: ubah hanya di `pengadaan-workflow.ts` (job mana yang dibuat saat Setuju dan job mana yang dibuat setelahnya), status UI tetap sama.

**Selesai jika:** PDF final di sandbox memiliki ttd TBIG, meterai, dan ttd vendor yang valid (cek dengan viewer PDF yang menampilkan panel signature, mis. Adobe Acrobat Reader).

### Step 2.8 — Pengalaman vendor saat tanda tangan
- Jika Mekari mengembalikan signing URL: tombol "Lanjutkan Tanda Tangan" membuka URL tersebut.
- Jika hanya email: tampilkan pesan "Silakan cek email Anda dari Mekari Sign…" + tombol "Cek status".
- Pastikan setelah vendor selesai tanda tangan, status di aplikasi berubah (via webhook atau polling).

**Selesai jika:** vendor uji menyelesaikan tanda tangan (termasuk verifikasi identitas Mekari) tanpa perlu login ke aplikasi Mekari.

### Step 2.9 — Uji end-to-end di sandbox
Jalankan seluruh skenario di bagian 10 dengan `ESIGN_MODE=mekari`. Catat hasil di `docs/mekari/e2e-result.md` (tanggal, skenario, hasil, catatan, screenshot bila perlu).

**Selesai jika:** skenario 1–5 lolos; kendala yang bergantung pada Mekari tercatat jelas.

---

## 10. Skenario Uji

| # | Skenario | Hasil yang diharapkan |
|---|---|---|
| 1 | Happy path: TBIG buat → ttd → vendor1 Setuju → meterai → ttd vendor | Status akhir `SELESAI` di kedua sisi; PDF final berisi ttd TBIG, meterai, ttd vendor |
| 2 | Penolakan: TBIG buat → ttd → vendor1 Tolak dengan alasan | Status `DITOLAK`, alasan tampil di sisi TBIG, tidak ada job meterai/ttd vendor |
| 3 | Isolasi akses: vendor2 membuka URL detail milik vendor1 (halaman & file) | 404 |
| 4 | Visibilitas: pengadaan `DRAFT` tidak muncul di daftar vendor | Tidak muncul; URL detail → 404 |
| 5 | Idempotensi: kirim ulang webhook yang sama untuk job yang sudah selesai | Tidak ada perubahan data; event tercatat di `WebhookEvent` |
| 6 | Kegagalan job (mock: `MOCK_ESIGN_FAIL`) lalu "Coba lagi" | Error tampil, status pengadaan tidak berubah, retry berhasil |
| 7 | Transisi tidak valid: memanggil aksi Setuju pada pengadaan `DRAFT` | Ditolak dengan pesan error |
| 8 | Validasi form: tanggal "sampai" < "dari", harga 0, No. SP duplikat, file bukan PDF | Semua ditolak dengan pesan yang jelas |

---

## 11. Skenario Demo (±5 menit)

1. Login sebagai TBIG → buat pengadaan baru dengan PDF contoh → tunjukkan preview dengan Lembar Pengesahan.
2. Klik "Tandatangani sebagai TBIG" → status berubah otomatis → tunjukkan ttd TBIG di PDF.
3. Logout → login sebagai vendor1 → buka pengadaan → klik Setuju → meterai terbubuh → Lanjutkan Tanda Tangan → selesai.
4. Login kembali sebagai TBIG → daftar menampilkan status "Sudah ttd vendor (selesai)" → unduh PDF final.
5. (Opsional) Buat pengadaan kedua → vendor menolak → tunjukkan status dan alasan penolakan.
