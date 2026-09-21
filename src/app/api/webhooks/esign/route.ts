import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getESignProvider } from "@/lib/esign";
import { handleESignEvent } from "@/lib/workflow/handle-esign-event";

import { Prisma } from "@/generated/prisma/client";

export async function POST(req: NextRequest) {
  // 1. Verifikasi token rahasia webhook
  const token = req.nextUrl.searchParams.get("token");
  const expectedToken = process.env.ESIGN_WEBHOOK_TOKEN;
  if (expectedToken && token !== expectedToken) {
    return NextResponse.json(
      { error: "Unauthorized: Token webhook tidak valid." },
      { status: 401 }
    );
  }

  // 2. Clone request untuk provider.parseWebhook dan ambil payload mentah
  const clonedReq = req.clone();
  let rawPayload: unknown = null;
  try {
    rawPayload = await req.json();
  } catch {
    rawPayload = null;
  }

  const provider = getESignProvider();
  const payloadObj = (rawPayload && typeof rawPayload === "object") ? (rawPayload as Record<string, unknown>) : {};

  // Simpan payload mentah ke WebhookEvent
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: provider.name,
      payload: payloadObj as Prisma.InputJsonObject,
      eventType: typeof payloadObj.type === "string" ? payloadObj.type : null,
      externalId: typeof payloadObj.externalId === "string" ? payloadObj.externalId : null,
    },
  });

  // 3. Provider mem-parse & memverifikasi payload
  let parsedEvent;
  try {
    parsedEvent = await provider.parseWebhook(clonedReq);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { error: `Gagal mem-parse webhook: ${errorMsg}` },
    });
    return NextResponse.json(
      { error: "Payload webhook tidak valid atau verifikasi gagal." },
      { status: 400 }
    );
  }

  // 4. Proses event lewat handleESignEvent
  try {
    const result = await handleESignEvent(parsedEvent);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { error: errorMsg },
    });
    return NextResponse.json(
      { error: `Gagal memproses event: ${errorMsg}` },
      { status: 500 }
    );
  }
}
