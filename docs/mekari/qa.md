# Tanya Jawab Teknis Integrasi Mekari eSign & eMeterai

Dokumen ini mencatat konfirmasi teknis dari tim Mekari untuk implementasi Fase 2.

---

### 1. Auto Sign TBIG (Server-to-Server Signing Tanpa OTP)
- **Konteks**: Sistem TBIG harus menandatangani dokumen secara otomatis saat pengadaan disetujui, tanpa interaksi manual/OTP per dokumen dari user TBIG.
- **Pertanyaan**:
  - Apakah fitur Auto Sign didukung via API HMAC?
  - Apa nama endpoint dan metodenya?
  - Apa prasyarat setup di portal Mekari (mis. eKYC perwakilan perusahaan, upload spesimen tanda tangan, aktivasi sertifikat enterprise)?
- **Jawaban Mekari**:
  - *Status*: Pending
  - *Catatan*:

---

### 2. Metode Akses Signer Eksternal (Vendor) — Signing URL vs Email Only
- **Konteks**: Setelah dokumen dibubuhi eMeterai, vendor harus menandatangani. Perlu dipastikan apakah vendor bisa tanda tangan langsung via tautan/embed di aplikasi web TBIG (in-app signing) atau wajib lewat email.
- **Pertanyaan**:
  - Ketika memanggil API request sign untuk signer eksternal (email vendor), apakah response API mengembalikan URL penandatanganan (`signing_url` / `action_url`) atau dokumen hanya bisa diakses via tautan di email resmi Mekari?
  - Jika ada signing URL, berapa masa berlakunya (TTL) dan apakah bisa di-regenerate jika kedaluwarsa?
  - Apakah email default dari Mekari bisa di-nonaktifkan jika kita ingin mendistribusikan link secara mandiri?
- **Jawaban Mekari**:
  - *Status*: Terverifikasi via Pengujian Sandbox Mekari (Step 2.8)
  - *Temuan & Keputusan Teknis*:
    1. **Akses Dokumen Vendor Berbasis Email Resmi**:
       - Endpoint `POST /documents/request_global_sign` dengan parameter `signing_url: true` pada Sandbox Mekari tidak mengembalikan signing URL langsung di response payload (`signing_link: []`, `signing_url: null`).
       - Percobaan memanggil endpoint `POST /documents/:id/generate_signing_url` mengembalikan error `403 Forbidden` (`Compliances not allowed`), yang mengindikasikan fitur direct signing link dibatasi pada paket enterprise atau jenis compliance tertentu.
       - Mekari secara otomatis mengirimkan email notifikasi resmi ke alamat email signer eksternal (vendor) yang memuat tombol/tautan aman untuk proses penandatanganan dan eKYC/OTP Mekari.
    2. **Implementasi UI Sesuai PRD Step 2.8**:
       - Aplikasi TBIG menampilkan instruksi: *"Silakan cek email Anda dari Mekari Sign untuk menandatangani dokumen pengadaan."* beserta tombol **"Cek status"** untuk sinkronisasi hasil setelah vendor menandatangani.
       - Jika di masa mendatang Mekari mengembalikan `signing_url`, tombol *"Lanjutkan Tanda Tangan"* otomatis aktif membuka URL tersebut.

---

### 3. Aturan Urutan (Sequence) Pembubuhan eMeterai vs Tanda Tangan Digital
- **Konteks**: Dokumen PDF memuat tanda tangan TBIG, eMeterai resmi Peruri, dan tanda tangan vendor. Modifikasi layer dokumen setelah digital signature berisiko merusak validitas kriptografis signature sebelumnya (*document altered warning* di PDF reader).
- **Pertanyaan**:
  - Bagaimana urutan pembubuhan yang sah dan didukung engine Mekari:
    - Opsi A: TBIG Sign -> Stamp eMeterai -> Vendor Sign?
    - Opsi B: TBIG Sign -> Vendor Sign -> Stamp eMeterai (meterai di akhir setelah semua ttd)?
    - Opsi C: Stamp eMeterai terlebih dahulu sebelum semua tanda tangan?
  - Apakah eMeterai dan tanda tangan bisa disubmit dalam 1 API call atau wajib bertahap?
- **Jawaban Mekari**:
  - *Status*: Terverifikasi via Pengujian Sandbox Mekari (Step 2.7)
  - *Temuan & Keputusan Teknis*:
    1. **Urutan yang Didukung Engine Mekari**:
       - Pembubuhan eMeterai via `POST /documents/stamp` membubuhkan segel digital Peruri (`/FT /Sig`, SubFilter `/ETSI.CAdES.detached`) yang mengunci sertifikat kriptografis dokumen.
       - Jika memanggil `request_global_sign` di atas dokumen yang telah ber-meterai, engine Mekari menolak dengan pesan error `422 Unprocessable Entity`: `{"doc": ["File already has a certificate"]}`.
       - Oleh karena itu, **urutan penandatanganan dan eMeterai bertahap harus menempatkan eMeterai setelah tanda tangan digital** (Opsi B: TBIG Sign -> Vendor Sign -> Stamp eMeterai) ATAU menggabungkan tanda tangan dan meterai dalam satu siklus envelope jika didukung.
    2. **Kompatibilitas Alur Saat Ini**:
       - Dalam alur bertahap POC, urutan yang sah tanpa benturan sertifikat adalah **TBIG Sign -> Vendor Sign -> Stamp eMeterai**.
       - Dokumen final yang dihasilkan pada alur tersebut memuat anotasi signature widget `/FT /Sig` valid di panel Acrobat Reader tanpa merusak integritas dokumen.

---

### 4. Spesifikasi & Keamanan Callback / Webhook
- **Konteks**: Backend TBIG butuh event notifikasi asynchronous saat meterai selesai dibubuhkan, saat vendor selesai tanda tangan, atau saat terjadi kegagalan/penolakan.
- **Pertanyaan**:
  - Kapan saja webhook dikirim dan apa daftar nama event-nya (mis. `document.signed`, `stamping.completed`, `document.rejected`)?
  - Bagaimana contoh format JSON payload lengkap untuk masing-masing event?
  - Bagaimana cara memverifikasi keaslian webhook agar aman dari spoofing (header signature HMAC SHA256 atau shared token)?
  - Bagaimana kebijakan retry jika backend penerima mengembalikan error/timeout?
- **Jawaban Mekari**:
  - *Status*: Pending
  - *Catatan*:

---

### 5. Konvensi Sistem Koordinat Anotasi (Tanda Tangan & eMeterai)
- **Konteks**: Backend harus menentukan posisi bounding box ttd TBIG, eMeterai, dan ttd Vendor secara presisi pada layout Surat Pesanan PDF (format A4).
- **Pertanyaan**:
  - Apa titik acuan origin `(0,0)` koordinat anotasi (Top-Left atau Bottom-Left standar PDF native)?
  - Apa satuan unit yang digunakan (PDF points 595x842 pt, pixels, millimeter, atau persentase)?
  - Berapa ukuran rekomendasi bounding box (`width` & `height`) untuk stempel eMeterai Peruri dan tanda tangan digital?
  - Apakah posisi eMeterai diperbolehkan sedikit beririsan/menempel dengan tanda tangan (seperti meterai fisik)?
- **Jawaban Mekari**:
  - *Status*: Terkonfirmasi via Sandbox Probe (Step 2.6)
  - *Catatan*:
    1. Origin acuan Mekari adalah **Top-Left (0,0)** dengan satuan point (A4: 595 × 842 pt).
    2. Mekari melakukan konversi otomatis ke PDF native bottom-left: `y_pdf = canvas_height - position_y - element_height`.
    3. Posisi `vendorMeterai` di `(x: 330, y: 560, w: 80, h: 80)` menghasilkan native PDF `/Rect [330 202 410 282]`, persis 100% mendarat tepat di dalam kotak penanda Lembar Pengesahan.
    4. Koordinat `tbigSignature` `[60, 202, 240, 282]` dan `vendorSignature` `[420, 202, 550, 282]` berada sejajar secara horizontal tanpa overlap.

---

### 6. Tipe Sertifikasi Tanda Tangan & eKYC (PSrE vs Simple Sign)
- **Konteks**: Menentukan apakah signer eksternal (vendor) wajib melewati proses verifikasi identitas (eKYC) dengan KTP & biometrik liveness, atau cukup tanda tangan elektronik sederhana.
- **Pertanyaan**:
  - Apakah akun sandbox dan production ini menggunakan tanda tangan tersertifikasi PSrE Berinduk Kominfo?
  - Apakah signer eksternal (vendor) diwajibkan registrasi & menyelesaikan eKYC sebelum bisa tanda tangan?
  - Jika wajib eKYC, apakah bisa dilakukan on-the-fly saat membuka signing link?
  - Apakah tersedia opsi simple electronic signature (cukup OTP email/SMS) jika eKYC tidak diharuskan?
- **Jawaban Mekari**:
  - *Status*: Pending
  - *Catatan*:
