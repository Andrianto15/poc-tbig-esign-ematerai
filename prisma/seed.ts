import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient, Role, PengadaanStatus, FileKind } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { generateLembarPengesahan } from "../src/lib/pdf/lembar-pengesahan";
import { buildPengadaanStorageKey } from "../src/lib/storage/types";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function calculateSha256(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function uploadFile(key: string, bytes: Uint8Array): Promise<void> {
  const driver = (process.env.STORAGE_DRIVER || "neon").toLowerCase();
  if (driver === "local") {
    const baseDir = path.resolve(process.env.LOCAL_STORAGE_DIR || "./.storage");
    const filePath = path.join(baseDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
    return;
  }

  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "ap-southeast-1";
  const bucket = process.env.AWS_BUCKET_NAME || "pengadaan-docs";

  if (endpoint && accessKeyId && secretAccessKey) {
    const s3 = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: "application/pdf",
      })
    );
  }
}

async function createSamplePdf(title: string, noSP: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText("SURAT PERJANJIAN PENGADAAN BARANG / JASA", {
    x: 50,
    y: 780,
    size: 15,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  });

  page.drawText(`Nomor: ${noSP}`, {
    x: 50,
    y: 755,
    size: 10,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.4),
  });

  page.drawLine({
    start: { x: 50, y: 745 },
    end: { x: 545, y: 745 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.85),
  });

  page.drawText(`Nama Paket Pengadaan:`, {
    x: 50,
    y: 715,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.2),
  });

  page.drawText(title, {
    x: 50,
    y: 695,
    size: 11,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(
    "Dokumen ini memuat kesepakatan ruang lingkup pekerjaan, jadwal pelaksanaan, serta spesifikasi teknis",
    {
      x: 50,
      y: 660,
      size: 9,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    }
  );

  page.drawText(
    "yang disepakati antara PT Tower Bersama Infrastructure Tbk dan mitra penyedia yang bersangkutan.",
    {
      x: 50,
      y: 645,
      size: 9,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    }
  );

  return await doc.save();
}

async function main() {
  console.log("Seeding database ke Neon...");

  const seedPassword = process.env.SEED_PASSWORD || "password123";
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  const tbigEmail = process.env.SEED_TBIG_EMAIL || "tbig@poc.local";
  const vendor1Email = process.env.SEED_VENDOR1_EMAIL || "vendor1@poc.local";
  const vendor2Email = process.env.SEED_VENDOR2_EMAIL || "vendor2@poc.local";
  const vendor3Email = process.env.SEED_VENDOR3_EMAIL || "vendor3@poc.local";
  const vendor4Email = process.env.SEED_VENDOR4_EMAIL || "vendor4@poc.local";

  // 1. Upsert TBIG Admin User
  const tbigUser = await prisma.user.upsert({
    where: { email: tbigEmail },
    update: {
      nama: "Admin Pengadaan TBIG",
      role: Role.TBIG,
      passwordHash,
      vendorId: null,
    },
    create: {
      email: tbigEmail,
      nama: "Admin Pengadaan TBIG",
      role: Role.TBIG,
      passwordHash,
      vendorId: null,
    },
  });
  console.log(`TBIG user: ${tbigUser.email}`);

  // 2. Upsert 4 Vendors & Users
  const vendorsData = [
    {
      nama: "PT Contoh Konstruksi Satu",
      alamat: "Jl. Jendral Sudirman No. 123, Jakarta Pusat",
      picNama: "Budi Santoso",
      picJabatan: "Direktur Operasional",
      email: vendor1Email,
    },
    {
      nama: "PT Contoh Teknik Dua",
      alamat: "Jl. Gatot Subroto Kav. 45, Jakarta Selatan",
      picNama: "Siti Aminah",
      picJabatan: "Direktur Utama",
      email: vendor2Email,
    },
    {
      nama: "PT Citra Sarana Solusindo",
      alamat: "Jl. TB Simatupang No. 88, Jakarta Selatan",
      picNama: "Hendro Prasetyo",
      picJabatan: "Direktur Utama",
      email: vendor3Email,
    },
    {
      nama: "PT Mega Nusa Fiberindo",
      alamat: "Jl. Pemuda No. 17, Surabaya",
      picNama: "Dewi Lestari",
      picJabatan: "General Manager",
      email: vendor4Email,
    },
  ];

  const createdVendors: Record<string, { id: string; nama: string; picNama: string; picJabatan: string }> = {};

  for (const v of vendorsData) {
    const existing = await prisma.vendor.findFirst({
      where: { nama: v.nama },
    });

    const vendor = existing
      ? await prisma.vendor.update({
          where: { id: existing.id },
          data: {
            nama: v.nama,
            alamat: v.alamat,
            picNama: v.picNama,
            picJabatan: v.picJabatan,
          },
        })
      : await prisma.vendor.create({
          data: {
            nama: v.nama,
            alamat: v.alamat,
            picNama: v.picNama,
            picJabatan: v.picJabatan,
          },
        });

    createdVendors[v.nama] = vendor;

    await prisma.user.upsert({
      where: { email: v.email },
      update: {
        nama: v.picNama,
        role: Role.VENDOR,
        passwordHash,
        vendorId: vendor.id,
      },
      create: {
        email: v.email,
        nama: v.picNama,
        role: Role.VENDOR,
        passwordHash,
        vendorId: vendor.id,
      },
    });

    console.log(`Vendor siap: ${vendor.nama} (${v.email})`);
  }

  // 3. Upsert 5 Draft Pengadaan dengan tujuan vendor beragam
  const drafts = [
    {
      noSuratPesanan: "SP-TBIG/2026/04/001",
      namaPengadaan: "Pemeliharaan Preventif dan Korektif Menara BTS Area Jabodetabek",
      alamat: "Jl. Gatot Subroto Kav. 18, Jakarta Selatan",
      harga: BigInt(350000000),
      tanggalMulai: new Date("2026-04-01T00:00:00.000Z"),
      tanggalSelesai: new Date("2026-09-30T00:00:00.000Z"),
      tanggalPenyelesaian: new Date("2026-09-30T00:00:00.000Z"),
      vendorName: "PT Contoh Konstruksi Satu",
    },
    {
      noSuratPesanan: "SP-TBIG/2026/04/002",
      namaPengadaan: "Pengadaan Perangkat Router & Switch Core Regional Jawa Barat",
      alamat: "Jl. Soekarno Hatta No. 450, Bandung",
      harga: BigInt(520000000),
      tanggalMulai: new Date("2026-04-10T00:00:00.000Z"),
      tanggalSelesai: new Date("2026-07-10T00:00:00.000Z"),
      tanggalPenyelesaian: new Date("2026-07-10T00:00:00.000Z"),
      vendorName: "PT Contoh Teknik Dua",
    },
    {
      noSuratPesanan: "SP-TBIG/2026/04/003",
      namaPengadaan: "Pembangunan Jalur Fiber Optic Backhaul Pantura 45 KM",
      alamat: "Jl. Raya Pantura KM 122, Cirebon",
      harga: BigInt(1250000000),
      tanggalMulai: new Date("2026-05-01T00:00:00.000Z"),
      tanggalSelesai: new Date("2026-11-01T00:00:00.000Z"),
      tanggalPenyelesaian: new Date("2026-11-01T00:00:00.000Z"),
      vendorName: "PT Mega Nusa Fiberindo",
    },
    {
      noSuratPesanan: "SP-TBIG/2026/04/004",
      namaPengadaan: "Modernisasi Sistem DC Power & Rectifier Site Cluster Sumatera",
      alamat: "Jl. Putri Hijau No. 20, Medan",
      harga: BigInt(480000000),
      tanggalMulai: new Date("2026-04-15T00:00:00.000Z"),
      tanggalSelesai: new Date("2026-08-15T00:00:00.000Z"),
      tanggalPenyelesaian: new Date("2026-08-15T00:00:00.000Z"),
      vendorName: "PT Citra Sarana Solusindo",
    },
    {
      noSuratPesanan: "SP-TBIG/2026/04/005",
      namaPengadaan: "Pengadaan Genset Silent Backup 50kVA Area Jawa Tengah & DIY",
      alamat: "Jl. Pemuda No. 110, Semarang",
      harga: BigInt(780000000),
      tanggalMulai: new Date("2026-05-15T00:00:00.000Z"),
      tanggalSelesai: new Date("2026-10-15T00:00:00.000Z"),
      tanggalPenyelesaian: new Date("2026-10-15T00:00:00.000Z"),
      vendorName: "PT Contoh Konstruksi Satu",
    },
  ];

  for (const d of drafts) {
    const vendor = createdVendors[d.vendorName];
    if (!vendor) continue;

    const existingPengadaan = await prisma.pengadaan.findUnique({
      where: { noSuratPesanan: d.noSuratPesanan },
      include: { files: true },
    });

    if (existingPengadaan && existingPengadaan.files.length >= 2) {
      console.log(`Draft ${d.noSuratPesanan} sudah ada. Dilewati.`);
      continue;
    }

    const pengadaanId = existingPengadaan ? existingPengadaan.id : crypto.randomUUID();

    console.log(`Membuat PDF & Lembar Pengesahan untuk draft ${d.noSuratPesanan}...`);
    const sampleOriginalPdf = await createSamplePdf(d.namaPengadaan, d.noSuratPesanan);
    const preparedPdf = await generateLembarPengesahan(sampleOriginalPdf, {
      id: pengadaanId,
      namaPengadaan: d.namaPengadaan,
      alamat: d.alamat,
      harga: d.harga,
      tanggalMulai: d.tanggalMulai,
      tanggalSelesai: d.tanggalSelesai,
      noSuratPesanan: d.noSuratPesanan,
      tanggalPenyelesaian: d.tanggalPenyelesaian,
      vendorNama: vendor.nama,
      picNama: vendor.picNama,
      picJabatan: vendor.picJabatan,
      createdAt: new Date(),
    });

    const now = Date.now();
    const originalKey = buildPengadaanStorageKey(pengadaanId, "ORIGINAL", now);
    const preparedKey = buildPengadaanStorageKey(pengadaanId, "PREPARED", now);

    await uploadFile(originalKey, sampleOriginalPdf);
    await uploadFile(preparedKey, preparedPdf);

    const originalSha = calculateSha256(sampleOriginalPdf);
    const preparedSha = calculateSha256(preparedPdf);

    if (existingPengadaan) {
      // Hapus file lama jika ada
      await prisma.documentFile.deleteMany({ where: { pengadaanId } });
      await prisma.documentFile.createMany({
        data: [
          {
            pengadaanId,
            kind: FileKind.ORIGINAL,
            storageKey: originalKey,
            sizeBytes: sampleOriginalPdf.byteLength,
            sha256: originalSha,
          },
          {
            pengadaanId,
            kind: FileKind.PREPARED,
            storageKey: preparedKey,
            sizeBytes: preparedPdf.byteLength,
            sha256: preparedSha,
          },
        ],
      });
      console.log(`Draft ${d.noSuratPesanan} diperbarui.`);
    } else {
      await prisma.pengadaan.create({
        data: {
          id: pengadaanId,
          namaPengadaan: d.namaPengadaan,
          alamat: d.alamat,
          harga: d.harga,
          tanggalMulai: d.tanggalMulai,
          tanggalSelesai: d.tanggalSelesai,
          noSuratPesanan: d.noSuratPesanan,
          tanggalPenyelesaian: d.tanggalPenyelesaian,
          vendorId: vendor.id,
          picNama: vendor.picNama,
          picJabatan: vendor.picJabatan,
          status: PengadaanStatus.DRAFT,
          createdById: tbigUser.id,
          files: {
            create: [
              {
                kind: FileKind.ORIGINAL,
                storageKey: originalKey,
                sizeBytes: sampleOriginalPdf.byteLength,
                sha256: originalSha,
              },
              {
                kind: FileKind.PREPARED,
                storageKey: preparedKey,
                sizeBytes: preparedPdf.byteLength,
                sha256: preparedSha,
              },
            ],
          },
          logs: {
            create: {
              actorId: tbigUser.id,
              action: "DRAFT_CREATED",
              note: "Pengadaan dibuat via database seed dengan dokumen Lembar Pengesahan.",
            },
          },
        },
      });
      console.log(`Draft ${d.noSuratPesanan} berhasil dibuat.`);
    }
  }

  console.log("Seeding data selesai dengan sukses!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
