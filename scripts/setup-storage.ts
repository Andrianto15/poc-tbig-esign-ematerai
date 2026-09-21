import "dotenv/config";
import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

async function setupNeonStorage() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "ap-southeast-1";
  const bucketName = process.env.AWS_BUCKET_NAME || "pengadaan-docs";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error("AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, atau AWS_SECRET_ACCESS_KEY belum diisi di .env");
    process.exit(1);
  }

  const s3 = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });

  console.log(`[Neon Storage] Memeriksa bucket '${bucketName}'...`);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`[Neon Storage] Bucket '${bucketName}' siap digunakan.`);
  } catch {
    console.log(`[Neon Storage] Bucket belum ada atau belum bisa diakses. Mencoba membuat bucket '${bucketName}'...`);
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
      console.log(`[Neon Storage] Bucket '${bucketName}' berhasil dibuat.`);
    } catch (createErr: unknown) {
      const msg = createErr instanceof Error ? createErr.message : String(createErr);
      console.error("[Neon Storage] Gagal membuat bucket:", msg);
      process.exit(1);
    }
  }
}

async function setupSupabaseStorage() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "pengadaan-docs";

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error("SUPABASE_URL atau SUPABASE_SECRET_KEY belum diisi di .env");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false },
    realtime: { transport: ws as never },
  });

  console.log(`Memeriksa bucket '${bucketName}'...`);
  const { data: bucket, error: getError } = await supabase.storage.getBucket(bucketName);

  if (bucket && !getError) {
    console.log(`Bucket '${bucketName}' sudah ada. Memperbarui konfigurasi...`);
    const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
      public: false,
      fileSizeLimit: "10MB",
      allowedMimeTypes: ["application/pdf"],
    });

    if (updateError) {
      console.error("Gagal memperbarui bucket:", updateError.message);
      process.exit(1);
    }
    console.log(`Bucket '${bucketName}' berhasil diperbarui (private, max 10MB, pdf only).`);
    return;
  }

  console.log(`Bucket '${bucketName}' belum ada. Membuat bucket baru...`);
  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["application/pdf"],
  });

  if (createError) {
    console.error("Gagal membuat bucket:", createError.message);
    process.exit(1);
  }

  console.log(`Bucket '${bucketName}' berhasil dibuat (private, max 10MB, pdf only).`);
}

async function main() {
  const driver = (process.env.STORAGE_DRIVER || "neon").toLowerCase();
  if (driver === "local") {
    console.log("[Storage] STORAGE_DRIVER=local. Tidak memerlukan setup cloud bucket.");
    return;
  }

  if (driver === "supabase") {
    await setupSupabaseStorage();
  } else {
    await setupNeonStorage();
  }
}

main().catch((err) => {
  console.error("Setup storage gagal:", err);
  process.exit(1);
});
