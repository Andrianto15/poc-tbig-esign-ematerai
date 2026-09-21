import "dotenv/config";
import { PrismaClient, Role } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  const seedPassword = process.env.SEED_PASSWORD || "password123";
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  const tbigEmail = process.env.SEED_TBIG_EMAIL || "tbig@poc.local";
  const vendor1Email = process.env.SEED_VENDOR1_EMAIL || "vendor1@poc.local";
  const vendor2Email = process.env.SEED_VENDOR2_EMAIL || "vendor2@poc.local";

  // Upsert Vendors
  const vendor1Data = {
    nama: "PT Contoh Konstruksi Satu",
    alamat: "Jl. Jendral Sudirman No. 123, Jakarta Pusat",
    picNama: "Budi Santoso",
    picJabatan: "Direktur Operasional",
  };

  const existingVendor1 = await prisma.vendor.findFirst({
    where: { nama: vendor1Data.nama },
  });

  const vendor1 = existingVendor1
    ? await prisma.vendor.update({
        where: { id: existingVendor1.id },
        data: vendor1Data,
      })
    : await prisma.vendor.create({
        data: vendor1Data,
      });

  const vendor2Data = {
    nama: "PT Contoh Teknik Dua",
    alamat: "Jl. Gatot Subroto Kav. 45, Jakarta Selatan",
    picNama: "Siti Aminah",
    picJabatan: "Direktur Utama",
  };

  const existingVendor2 = await prisma.vendor.findFirst({
    where: { nama: vendor2Data.nama },
  });

  const vendor2 = existingVendor2
    ? await prisma.vendor.update({
        where: { id: existingVendor2.id },
        data: vendor2Data,
      })
    : await prisma.vendor.create({
        data: vendor2Data,
      });

  // Upsert TBIG User
  await prisma.user.upsert({
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

  // Upsert Vendor 1 User
  await prisma.user.upsert({
    where: { email: vendor1Email },
    update: {
      nama: "Budi Santoso",
      role: Role.VENDOR,
      passwordHash,
      vendorId: vendor1.id,
    },
    create: {
      email: vendor1Email,
      nama: "Budi Santoso",
      role: Role.VENDOR,
      passwordHash,
      vendorId: vendor1.id,
    },
  });

  // Upsert Vendor 2 User
  await prisma.user.upsert({
    where: { email: vendor2Email },
    update: {
      nama: "Siti Aminah",
      role: Role.VENDOR,
      passwordHash,
      vendorId: vendor2.id,
    },
    create: {
      email: vendor2Email,
      nama: "Siti Aminah",
      role: Role.VENDOR,
      passwordHash,
      vendorId: vendor2.id,
    },
  });

  console.log("Database seeded successfully.");
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
