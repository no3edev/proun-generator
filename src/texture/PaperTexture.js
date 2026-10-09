// Layer 1 of the material system: the physical sheet. Static, and —
// unlike the old single-pass noise generator this replaces — built
// once and cached, since real paper grain doesn't change per palette
// or per shape; only its *tint* does (see tintStructure below). This
// is a structured procedural stand-in (multi-octave blurred noise +
// directional fiber lines) for a real scanned/photographed paper
// texture: no image-asset pipeline exists in this project yet, so
// there was nothing to source a real scan into. Swapping in a real
// scan later means replacing the body of paperStructure() with an
// image load; nothing downstream (PigmentLayer.js, materials.js,
// SceneManager.js) needs to change to accommodate that.

import { blurredNoise, fiberLines } from './noise.js';
import { applyMicroVariation } from './MicroVariation.js';

const SIZE = 512;
let cached = null;

/**
 * The shared, grayscale, palette-independent paper structure. Built
 * once per session and cached — every shape's material and the
 * stage-wide overlay all sample this same canvas, so the whole
 * composition reads as one physical sheet rather than independent
 * random noise per surface.
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

  blurredNoise(ctx, SIZE, SIZE, 6, 0.05);   // broad tone drift
  blurredNoise(ctx, SIZE, SIZE, 24, 0.035); // mid-frequency mottle
  fiberLines(ctx, SIZE, SIZE, 40);
  applyMicroVariation(ctx, SIZE, SIZE, 0.012);

  cached = canvas;
  return cached;
}

/**
 * Multiply-tints a structure canvas with a palette color — used for
 * the stage-wide paper overlay (and its PNG-export twin), where the
 * paper needs to actually read as `paper` hex, not stay neutral.
 * Shape materials never call this: they stay neutral/grayscale and
 * get their color from material.color instead (see materials.js).
 *
 * @param {HTMLCanvasElement} structureCanvas
 * @param {string} hex
 * @returns {HTMLCanvasElement}
 */
export function tintStructure(structureCanvas, hex) {
  const size = structureCanvas.width;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(structureCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
