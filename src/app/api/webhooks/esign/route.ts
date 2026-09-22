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
  const payloadObj =
    rawPayload && typeof rawPayload === "object"
      ? (rawPayload as Record<string, unknown>)
      : {};

  const dataObj = payloadObj.data as Record<string, unknown> | undefined;
  const attrsObj = dataObj?.attributes as Record<string, unknown> | undefined;

  const extractedExternalId =
    (typeof payloadObj.externalId === "string" ? payloadObj.externalId : null) ||
    (typeof dataObj?.id === "string" ? dataObj.id : null) ||
    (typeof payloadObj.document_id === "string" ? payloadObj.document_id : null) ||
    (typeof payloadObj.id === "string" ? payloadObj.id : null);

  const extractedEventType =
    (typeof payloadObj.type === "string" ? payloadObj.type : null) ||
    (typeof attrsObj?.signing_status === "string"
      ? `signing.${attrsObj.signing_status}`
      : null) ||
    (typeof attrsObj?.stamping_status === "string"
      ? `stamping.${attrsObj.stamping_status}`
      : null) ||
    (typeof dataObj?.type === "string" ? dataObj.type : null);

  // Simpan payload mentah ke WebhookEvent
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: provider.name,
      payload: payloadObj as Prisma.InputJsonObject,
      eventType: extractedEventType,
      externalId: extractedExternalId,
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

  // Jika parsedEvent bernilai null (misal event notifikasi intermediate in_progress), catat dan abaikan
  if (!parsedEvent) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({
      success: true,
      message: "Event intermediate/in-progress dicatat dan diabaikan.",
    });
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
