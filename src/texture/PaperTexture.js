// Layer 1 of the material system: the physical sheet. Static, and —
// unlike the old single-pass noise generator this replaces — built
// once and cached, since real paper grain doesn't change per palette
// or per shape. This
// is a structured procedural stand-in (multi-octave blurred noise +
// directional fiber lines) for a real scanned/photographed paper
// texture: no image-asset pipeline exists in this project yet, so
// there was nothing to source a real scan into. Swapping in a real
// scan later means replacing the body of paperStructure() with an
// image load; nothing downstream (PigmentLayer.js, materials.js,
// SceneManager.js) needs to change to accommodate that.

import { blurredNoise, fiberLines, withNoiseSeed } from './noise.js';
import { applyMicroVariation } from './MicroVariation.js';

const SIZE = 512;
let cached = null;

/**
 * The shared, grayscale, palette-independent paper structure. Built
 * once per session and cached — the legacy
 * pigment pool (PigmentLayer.js) samples this canvas. (The stage-wide DOM overlay that
 * used to multiply it over the whole picture was retired in v0.14.0: the ground carries the
 * paper now.)
 *
 * @returns {HTMLCanvasElement}
 */
export function paperStructure() {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // seeded: the same sheet on every load
  withNoiseSeed(['paper'], () => {
    blurredNoise(ctx, SIZE, SIZE, 6, 0.05);   // broad tone drift
    blurredNoise(ctx, SIZE, SIZE, 24, 0.035); // mid-frequency mottle
    fiberLines(ctx, SIZE, SIZE, 40);
    applyMicroVariation(ctx, SIZE, SIZE, 0.012);
  });

  cached = canvas;
  return cached;
}
