import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { buildMockStorageKey } from "@/lib/storage/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  if (process.env.ESIGN_MODE !== "mock") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { jobId } = await params;
  if (!jobId) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const job = await prisma.signJob.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.externalId) {
    return new NextResponse("Job tidak ditemukan atau belum siap", { status: 404 });
  }

  const storage = getStorage();
  const mockStorageKey = buildMockStorageKey(job.externalId);
  const bytes = await storage.get(mockStorageKey);

  if (!bytes) {
    return new NextResponse("Dokumen tidak ditemukan di mock storage", {
      status: 404,
    });
  }

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Content-Length": bytes.byteLength.toString(),
    },
  });
}
