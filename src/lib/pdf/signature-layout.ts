export const PAGE = {
  width: 595,
  height: 842,
} as const;

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const LAYOUT = {
  tbigSignature: { x: 60, y: 560, width: 180, height: 80 },
  vendorMeterai: { x: 330, y: 560, width: 80, height: 80 },
  vendorSignature: { x: 420, y: 560, width: 130, height: 80 },
} as const;

/**
 * Konversi sistem koordinat top-left origin (PRD) ke bottom-left origin (pdf-lib)
 */
export function toPdfLibCoordinates(
  box: Box,
  pageHeight: number = PAGE.height
): { x: number; y: number; width: number; height: number } {
  return {
    x: box.x,
    y: pageHeight - box.y - box.height,
    width: box.width,
    height: box.height,
  };
}

/**
 * Konversi koordinat box ke format annotation Mekari eSign
 */
export function toMekariAnnotation(
  box: Box,
  pageNumber: number,
  typeOf: "signature" | "emeterai"
) {
  return {
    page: pageNumber,
    position_x: box.x,
    position_y: box.y,
    element_width: box.width,
    element_height: box.height,
    canvas_width: PAGE.width,
    canvas_height: PAGE.height,
    type_of: typeOf === "emeterai" ? "meterai" : typeOf,
  };
}
