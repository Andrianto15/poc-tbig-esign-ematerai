import { ESignProvider } from "./types";
import { MockESignProvider } from "./mock/provider";

export * from "./types";
export * from "./mock/provider";

let providerInstance: ESignProvider | null = null;

export function getESignProvider(): ESignProvider {
  if (providerInstance) {
    return providerInstance;
  }

  const mode = process.env.ESIGN_MODE || "mock";
  if (mode === "mock") {
    providerInstance = new MockESignProvider();
  } else if (mode === "mekari") {
    // Fase 2: MekariESignProvider (PRD Bagian 0 Aturan 4 & Step 2.3)
    throw new Error(
      "MekariESignProvider belum diintegrasikan di Fase 1. Gunakan ESIGN_MODE=mock."
    );
  } else {
    throw new Error(
      `ESIGN_MODE tidak valid: '${mode}'. Gunakan 'mock' atau 'mekari'.`
    );
  }

  return providerInstance;
}
