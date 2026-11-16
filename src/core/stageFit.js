// @ts-check

// How big the picture is on the screen. DOM-free, so the tests and the tools read it directly.
//
// Normal mode (the panel next to the stage): as large as fits in 92% x 86% of the window, never larger than its base size, at the
// device's pixel ratio. Exhibition mode: as large as fits in the WHOLE window (the surround is black), upscaled beyond the base size,
// with the drawing buffer held to a budget so a 4K screen at a high pixel ratio does not ask the GPU for 33 megapixels.

/** The drawing buffer budget in exhibition mode: a 3840 x 2160 screen at pixel ratio 1, or a 1920 x 1080 one at 2. */
export const EXHIBITION_MAX_PIXELS = 8_300_000;

/**
 * @param {{ dims: { w: number, h: number }, viewportW: number, viewportH: number, exhibition?: boolean, dpr?: number,
 *           maxPixels?: number, maxSide?: number }} o
 *   dims: the orientation's base size (the aspect ratio is its); maxSide: the largest buffer side the GPU gives
 * @returns {{ w: number, h: number, pixelRatio: number }} the CSS size of the stage and the pixel ratio to render at
 */
export function stageSize({ dims, viewportW, viewportH, exhibition = false, dpr = 1, maxPixels = EXHIBITION_MAX_PIXELS, maxSide = Infinity }) {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  if (!exhibition) {
    const scale = Math.min((viewportW * 0.92) / dims.w, (viewportH * 0.86) / dims.h, 1);
    return { w: dims.w * scale, h: dims.h * scale, pixelRatio: ratio };
  }
  const scale = Math.min(viewportW / dims.w, viewportH / dims.h);
  // whole CSS pixels, rounded down: never a sliver past the edge of the screen, never a half-pixel seam
  const w = Math.max(1, Math.floor(dims.w * scale));
  const h = Math.max(1, Math.floor(dims.h * scale));
  const pixelRatio = Math.max(0.25, Math.min(ratio, Math.sqrt(maxPixels / (w * h)), maxSide / Math.max(w, h)));
  return { w, h, pixelRatio };
}
