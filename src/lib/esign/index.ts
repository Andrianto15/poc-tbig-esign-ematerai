import { ESignProvider } from "./types";
import { MockESignProvider } from "./mock/provider";
import { MekariESignProvider } from "./mekari/provider";

export * from "./types";
export * from "./mock/provider";
export * from "./mekari/provider";

let providerInstance: ESignProvider | null = null;

export function getESignProvider(): ESignProvider {
  if (providerInstance) {
    return providerInstance;
  }

  const mode = process.env.ESIGN_MODE || "mock";
  if (mode === "mock") {
    providerInstance = new MockESignProvider();
  } else if (mode === "mekari") {
    providerInstance = new MekariESignProvider();
  } else {
    throw new Error(
      `ESIGN_MODE tidak valid: '${mode}'. Gunakan 'mock' atau 'mekari'.`
    );
  }

  return providerInstance;
}
