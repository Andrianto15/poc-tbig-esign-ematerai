-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TBIG', 'VENDOR');

-- CreateEnum
CREATE TYPE "PengadaanStatus" AS ENUM ('DRAFT', 'MENUNGGU_TTD_TBIG', 'MENUNGGU_PERSETUJUAN_VENDOR', 'MENUNGGU_TTD_VENDOR', 'SELESAI', 'DITOLAK');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('ORIGINAL', 'PREPARED', 'SIGNED_TBIG', 'STAMPED_METERAI', 'FINAL');

-- CreateEnum
CREATE TYPE "SignJobType" AS ENUM ('AUTO_SIGN_TBIG', 'STAMP_METERAI', 'SIGN_VENDOR');

-- CreateEnum
CREATE TYPE "SignJobStatus" AS ENUM ('PENDING', 'WAITING_SIGNER', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "alamat" TEXT,
    "picNama" TEXT NOT NULL,
    "picJabatan" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pengadaan" (
    "id" TEXT NOT NULL,
    "namaPengadaan" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "harga" BIGINT NOT NULL,
    "tanggalMulai" TIMESTAMP(3) NOT NULL,
    "tanggalSelesai" TIMESTAMP(3) NOT NULL,
    "noSuratPesanan" TEXT NOT NULL,
    "tanggalPenyelesaian" TIMESTAMP(3) NOT NULL,
    "vendorId" TEXT NOT NULL,
    "picNama" TEXT NOT NULL,
    "picJabatan" TEXT NOT NULL,
    "status" "PengadaanStatus" NOT NULL DEFAULT 'DRAFT',
    "alasanPenolakan" TEXT,
    "tbigSignedAt" TIMESTAMP(3),
    "vendorRespondedAt" TIMESTAMP(3),
    "meteraiStampedAt" TIMESTAMP(3),
    "vendorSignedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pengadaan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" TEXT NOT NULL,
    "pengadaanId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignJob" (
    "id" TEXT NOT NULL,
    "pengadaanId" TEXT NOT NULL,
    "type" "SignJobType" NOT NULL,
    "status" "SignJobStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "signUrl" TEXT,
    "inputFileKind" "FileKind" NOT NULL,
    "outputFileKind" "FileKind" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SignJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "eventType" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "pengadaanId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pengadaan_noSuratPesanan_key" ON "Pengadaan"("noSuratPesanan");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_pengadaanId_kind_key" ON "DocumentFile"("pengadaanId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SignJob_externalId_key" ON "SignJob"("externalId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pengadaan" ADD CONSTRAINT "Pengadaan_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_pengadaanId_fkey" FOREIGN KEY ("pengadaanId") REFERENCES "Pengadaan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignJob" ADD CONSTRAINT "SignJob_pengadaanId_fkey" FOREIGN KEY ("pengadaanId") REFERENCES "Pengadaan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_pengadaanId_fkey" FOREIGN KEY ("pengadaanId") REFERENCES "Pengadaan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
