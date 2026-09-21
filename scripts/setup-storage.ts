import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

async function setupStorage() {
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

setupStorage().catch((err) => {
  console.error("Setup storage gagal:", err);
  process.exit(1);
});
