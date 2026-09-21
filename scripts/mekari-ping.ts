import "dotenv/config";
import { mekariRequest, MekariApiError } from "@/lib/esign/mekari/client";

interface MekariProfileResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      id: string;
      full_name: string;
      email: string;
      created_at: string;
      updated_at: string;
      balance: {
        remaining_emeterai_balance: number;
        emeterai_usage: number;
        global_sign_document: number;
        psre_signing: number;
        ekyc_quota: number;
      };
      subscription: {
        plan: string;
        status: string;
        expired_at: string;
      };
    };
  };
}

async function main() {
  console.log("==========================================");
  console.log("Mekari eSign Sandbox HMAC Ping Test");
  console.log("==========================================");

  const baseUrl = process.env.MEKARI_BASE_URL || "https://sandbox-api.mekari.com";
  const prefix = process.env.MEKARI_ESIGN_PATH_PREFIX || "/v2/esign-hmac/v1";
  const clientId = process.env.MEKARI_CLIENT_ID;

  if (!clientId || !process.env.MEKARI_CLIENT_SECRET) {
    console.error("❌ MEKARI_CLIENT_ID atau MEKARI_CLIENT_SECRET belum dikonfigurasi di .env");
    process.exit(1);
  }

  console.log(`Endpoint: ${baseUrl}${prefix}/profile`);
  console.log(`Client ID: ${clientId.slice(0, 4)}****`);

  try {
    const startTime = Date.now();
    const res = await mekariRequest<MekariProfileResponse>("GET", "/profile");
    const duration = Date.now() - startTime;

    console.log(`\n✅ Status: 200 OK (${duration}ms)`);
    console.log("Profil Akun Sandbox Mekari:");
    console.log(`- ID Pengguna   : ${res.data.id}`);
    console.log(`- Nama Lengkap  : ${res.data.attributes.full_name}`);
    console.log(`- Email         : ${res.data.attributes.email}`);
    console.log(`- Sisa eMeterai : ${res.data.attributes.balance.remaining_emeterai_balance}`);
    console.log(`- Kuota eKYC    : ${res.data.attributes.balance.ekyc_quota}`);
    console.log(`- Langganan     : ${res.data.attributes.subscription.plan} (${res.data.attributes.subscription.status})`);
    console.log("==========================================");
    console.log("Uji koneksi HMAC Step 2.1 BERHASIL.");
  } catch (error: unknown) {
    console.error("\n❌ Uji koneksi HMAC GAGAL.");
    if (error instanceof MekariApiError) {
      console.error(`HTTP Status: ${error.status} ${error.statusText}`);
      console.error("Response Body:", error.body);
    } else if (error instanceof Error) {
      console.error("Error:", error.message);
    } else {
      console.error("Unknown error:", error);
    }
    process.exit(1);
  }
}

main();
