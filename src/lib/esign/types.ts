import type { Box } from "@/lib/pdf/signature-layout";

export type { Box };

export interface Signer {
  name: string;
  email: string;
}

export interface AutoSignInput {
  jobId: string;
  pdf: Uint8Array;
  filename: string;
  page: number;
  box: Box;
  callbackUrl: string;
}

export interface StampMeteraiInput {
  jobId: string;
  pdf: Uint8Array;
  filename: string;
  page: number;
  box: Box;
  callbackUrl: string;
}

export interface RequestSignInput {
  jobId: string;
  pdf: Uint8Array;
  filename: string;
  signer: Signer;
  page: number;
  box: Box;
  callbackUrl: string;
  returnUrl: string; // ke halaman detail vendor
}

export interface SubmitResult {
  externalId: string;
  signUrl?: string; // hanya requestSign, jika provider menyediakan
}

export type ESignEvent = {
  provider: "mock" | "mekari";
  externalId: string;
  type: "COMPLETED" | "FAILED";
  errorMessage?: string;
  raw: unknown;
};

export interface ESignProvider {
  name: "mock" | "mekari";
  autoSign(input: AutoSignInput): Promise<SubmitResult>;
  stampMeterai(input: StampMeteraiInput): Promise<SubmitResult>;
  requestSign(input: RequestSignInput): Promise<SubmitResult>;
  downloadDocument(externalId: string): Promise<Uint8Array>;
  parseWebhook(req: Request): Promise<ESignEvent>; // termasuk verifikasi keaslian
  getStatus?(externalId: string): Promise<ESignEvent | null>; // fallback polling
}
