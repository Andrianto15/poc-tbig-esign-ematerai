import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { fileId } = await params;
  if (!fileId) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const documentFile = await prisma.documentFile.findUnique({
    where: { id: fileId },
    include: { pengadaan: true },
  });

  if (!documentFile) {
    return new NextResponse("File tidak ditemukan", { status: 404 });
  }

  // Access control per PRD 7.4
  if (user.role === "VENDOR") {
    // Vendor only can view their own pengadaan files
    if (documentFile.pengadaan.vendorId !== user.vendorId) {
      return new NextResponse("File tidak ditemukan", { status: 404 });
    }

    // Vendor cannot view DRAFT or MENUNGGU_TTD_TBIG documents
    const hiddenStatuses = ["DRAFT", "MENUNGGU_TTD_TBIG"];
    if (hiddenStatuses.includes(documentFile.pengadaan.status)) {
      return new NextResponse("File tidak ditemukan", { status: 404 });
    }
  }

  const storage = getStorage();
  const bytes = await storage.get(documentFile.storageKey);

  if (!bytes) {
    return new NextResponse("File tidak ditemukan di storage", { status: 404 });
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
