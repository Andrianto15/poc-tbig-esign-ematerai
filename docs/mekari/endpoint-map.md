# Pemetaan Endpoint API Mekari eSign (Fase 2)

Dokumen ini memetakan kebutuhan integrasi PoC Pengadaan TBIG ke endpoint resmi Mekari eSign berdasarkan `docs/mekari/esign-collection.json` (Postman Collection v2.1) dan konfirmasi teknis `docs/mekari/qa.md`.

Base URL Sandbox: `https://sandbox-api.mekari.com`  
Prefix Path HMAC: `/v2/esign-hmac/v1`

---

## 1. Tabel Pemetaan Endpoint Utama

| Kebutuhan | Method & path Mekari | Body penting | Response penting (id dokumen, signing URL) |
|---|---|---|---|
| **Auto Sign TBIG** | `POST /documents/request_global_auto_sign` *(atau `POST /psre_auto_sign/request_psre_auto_sign`)*<br>**[PERLU KONFIRMASI]** | `{ "template_id": string, "doc": "<base64>", "filename": string, "signers": [{ "name": string, "email": string, "is_autosign": true, "annotations": [...] }], "callback_url": string }` | - ID Dokumen: `data.id`<br>- Status Dokumen: `data.attributes.signing_status`<br>- URL File: `data.attributes.doc_url`<br>- Signing URL: N/A (otomatis server-side) |
| **Stamp eMeterai** | `POST /documents/stamp` | `{ "doc": "<base64>", "filename": string, "annotations": [{ "page": number, "position_x": number, "position_y": number, "element_width": number, "element_height": number, "canvas_width": number, "canvas_height": number, "type_of": "meterai" }], "callback_url": string }` | - ID Dokumen: `data.id`<br>- Status Meterai: `data.attributes.status` / `data.attributes.stamping_status`<br>- URL File: `data.attributes.doc_url`<br>- Signing URL: N/A |
| **Request tanda tangan signer eksternal (Vendor)** | `POST /documents/request_global_sign`<br>*(PSrE: `POST /documents/request_psre_sign`)*<br>*(Generate URL: `POST /documents/:id/generate_signing_url`)*<br>**[PERLU KONFIRMASI]** | `{ "doc": "<base64>", "filename": string, "signers": [{ "name": string, "email": string, "phone_number"?: { "country_code": string, "number": string }, "annotations": [{ "page": number, "position_x": number, "position_y": number, "element_width": number, "element_height": number, "canvas_width": number, "canvas_height": number, "type_of": "signature", "signature_type": "image" }] }], "signing_url": true, "signing_order": false, "callback_url": string }` | - ID Dokumen: `data.id`<br>- Status Dokumen: `data.attributes.signing_status` (`"in_progress"`)<br>- Status Signer: `data.attributes.signers[].status`<br>- Signing URL: `data.attributes.signing_link[0].signing_link` (Global) atau `data.attributes.signers[0].signing_url` (PSrE / `generate_signing_url`) |
| **Cek status dokumen** | `GET /documents/:id` | *None* | - ID Dokumen: `data.id`<br>- Status Dokumen: `data.attributes.signing_status`, `data.attributes.stamping_status`<br>- Status Signer: `data.attributes.signers[].signing_status`<br>- URL File: `data.attributes.doc_url`<br>- Signing URL: `data.attributes.signers[].signing_url` |
| **Unduh dokumen hasil** | `GET /documents/:id/download` | *None* | - Binary Stream PDF (`application/pdf`) |

---

## 2. Rincian & Analisis Teknis per Kebutuhan

### 2.1. Auto Sign TBIG
- **Temuan Koleksi Postman**:
  1. `POST /documents/request_global_auto_sign` hanya menerima `template_id`, `signers`, dan `callback_url` (tanpa payload dokumen ad-hoc `doc`).
  2. `POST /psre_auto_sign/request_psre_auto_sign` menerima `template_id` + `doc` (base64) + `signers` dengan flag `"is_autosign": true`.
  3. `POST /auto_sign` digunakan untuk mendaftarkan otorisasi relasi auto-sign antara pembuat dokumen (`doc_maker_emails`) dan penandatangan (`signer_emails`).
- **Status Konfirmasi**: **PERLU KONFIRMASI** (Sesuai `qa.md` Pertanyaan #1). Mekari belum mengonfirmasi apakah tanda tangan otomatis TBIG pada dokumen dinamis ad-hoc (Surat Pesanan PDF) didukung langsung via flag `is_autosign: true` di endpoint standar `request_global_sign` tanpa `template_id`, atau wajib template ID portal.

### 2.2. Stamp eMeterai
- **Endpoint**: `POST /documents/stamp`
- **Tipe Content-Type**: `application/json`
- **Struktur Payload**:
  ```json
  {
    "doc": "<base64_string_dokumen_pdf>",
    "filename": "Surat_Pesanan.pdf",
    "annotations": [
      {
        "page": 1,
        "position_x": 330,
        "position_y": 560,
        "element_width": 80,
        "element_height": 80,
        "canvas_width": 595,
        "canvas_height": 842,
        "type_of": "meterai"
      }
    ],
    "callback_url": "https://<app_domain>/api/webhooks/esign?token=<token>"
  }
  ```
- **Catatan Anotasi**: Nilai `type_of` pada payload Mekari adalah `"meterai"` (bukan `"emeterai"`).

### 2.3. Request Tanda Tangan Signer Eksternal (Vendor)
- **Endpoint**:
  - Global Sign: `POST /documents/request_global_sign`
  - PSrE Sign: `POST /documents/request_psre_sign`
  - Generate Signing URL: `POST /documents/:id/generate_signing_url`
- **Struktur Payload Global Sign**:
  ```json
  {
    "doc": "<base64_string_dokumen_pdf>",
    "filename": "Surat_Pesanan.pdf",
    "signers": [
      {
        "name": "PT Vendor Sukses",
        "email": "vendor1@poc.local",
        "phone_number": {
          "country_code": "62",
          "number": "81234567890"
        },
        "requires_otp": false,
        "annotations": [
          {
            "page": 1,
            "position_x": 420,
            "position_y": 560,
            "element_width": 130,
            "element_height": 80,
            "canvas_width": 595,
            "canvas_height": 842,
            "type_of": "signature",
            "signature_type": "image"
          }
        ]
      }
    ],
    "signing_url": true,
    "signing_order": false,
    "callback_url": "https://<app_domain>/api/webhooks/esign?token=<token>"
  }
  ```
- **Status Konfirmasi**: **PERLU KONFIRMASI** (Sesuai `qa.md` Pertanyaan #2 & #6). Menunggu kepastian apakah sandbox TBIG menggunakan sertifikat Global Sign (Simple) atau PSrE berinduk Kominfo, serta apakah `signing_link` dapat selalu diperoleh langsung atau vendor wajib membuka tautan email resmi Mekari.

### 2.4. Cek Status Dokumen (Fallback Polling)
- **Endpoint**: `GET /documents/:id`
- **Response Format**:
  ```json
  {
    "data": {
      "id": "bb60d271-8997-4177-a9cd-8e384b8bb5f1",
      "type": "document",
      "attributes": {
        "filename": "Surat_Pesanan.pdf",
        "category": "global",
        "doc_url": "/documents/bb60d271-8997-4177-a9cd-8e384b8bb5f1/download",
        "signing_status": "in_progress",
        "stamping_status": "none",
        "signers": [
          {
            "name": "PT Vendor Sukses",
            "email": "vendor1@poc.local",
            "order": 0,
            "status": "your_turn",
            "signed_at": null,
            "signing_url": "https://..."
          }
        ]
      }
    }
  }
  ```
- **Pemetaan Status**:
  - `signing_status`: `"in_progress"`, `"success"`, `"completed"`, `"voided"`, `"rejected"`
  - `stamping_status`: `"none"`, `"in_progress"`, `"success"`, `"failed"`

### 2.5. Unduh Dokumen Hasil
- **Endpoint**: `GET /documents/:id/download`
- Mengembalikan response binary file PDF ber-header `Content-Type: application/pdf`.
- Alternatif: Path relatif `doc_url` pada atribut detail dokumen.

---

## 3. Kesimpulan Kesiapan Step 2.3 (MekariESignProvider)

1. **Siap Diimplementasikan**:
   - `stampMeterai` (`POST /documents/stamp`)
   - `getStatus` (`GET /documents/:id`)
   - `downloadDocument` (`GET /documents/:id/download`)
2. **Memerlukan Konfirmasi / Adaptasi Sandbox**:
   - `autoSign`: Diuji coba dengan `POST /documents/request_global_sign` (`is_autosign: true` pada signer jika akun TBIG sudah setup auto-sign) atau fallback template.
   - `requestSign`: Menangani response URL baik dari array `signing_link` maupun `signers[].signing_url`, dengan fallback UI jika Mekari hanya mendistribusikan via email.
