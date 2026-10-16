// Layer 2 of the material system: the structure of applied paint —
// coverage density, opacity unevenness, brush marks — composited on
// top of the shared paper structure (PaperTexture.js) and finished
// with the micro-variation pass (MicroVariation.js). Like the paper
// layer, this is a structured procedural stand-in for a real
// photographed gouache/acrylic swatch (see PaperTexture.js's header
// for why no real asset is available in this environment); the mask
// this builds is what a real scan would be dropped in to replace.
//
// The key move: this stays entirely grayscale and hex-independent.
// Color is never baked in here — it comes from material.color, via
// the palette system, exactly as before (see materials.js). That's
// what lets a small pool of these be built once and reused across
// every palette and every random accent a shape ever gets, instead of
// baking a fresh canvas per instance like the old system did.

import * as THREE from 'three';
import { paperStructure } from './PaperTexture.js';
import { blurredNoise, softBlotches, brushStrokes, withNoiseSeed } from './noise.js';
import { createRng } from '../generator/rng.js';
import { applyMicroVariation } from './MicroVariation.js';

const POOL_SIZE = 4;
const CANVAS_SIZE = 256;
let pool = null;
// which pooled pattern and offset each material gets (legacy pattern only —
// the procedural paint does not use them): a fixed stream, not Math.random
const pick = createRng('pigment-pick');

function buildOne(_unused, index) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // paper grain shows through underneath the paint
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(paperStructure(), 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.globalCompositeOperation = 'source-over';

  // pigment coverage / opacity structure — seeded per pool slot, so the
  // pool is the same on every load
  withNoiseSeed(['pool', index], () => {
    blurredNoise(ctx, CANVAS_SIZE, CANVAS_SIZE, 10, 0.06);
    softBlotches(ctx, CANVAS_SIZE, CANVAS_SIZE, 8, {
      minR: 0.06, maxR: 0.18, minAlpha: 0.03, maxAlpha: 0.08
    });
    brushStrokes(ctx, CANVAS_SIZE, CANVAS_SIZE, 3);

    // micro variation, applied last, on top of everything
    applyMicroVariation(ctx, CANVAS_SIZE, CANVAS_SIZE, 0.015);
  });

  return canvas;
}

function getPool() {
  if (!pool) pool = Array.from({ length: POOL_SIZE }, buildOne);
  return pool;
}

/**
 * Returns a fresh THREE.CanvasTexture sourced from a randomly-chosen
 * pooled structure canvas, with a randomized UV offset so repeated
 * shapes don't visibly tile the exact same pattern in the exact same
 * place. Cheap even though it's "fresh": the canvas pixels themselves
 * are never redrawn here, only referenced, so this is a GPU upload of
 * an already-built image, not a new bake — the same cost profile as
 * cloning a texture.
 *
 * @returns {THREE.CanvasTexture}
 */
export function pickStructureTexture() {
  const canvases = getPool();
  const base = canvases[Math.floor(pick() * canvases.length)];
  const tex = new THREE.CanvasTexture(base);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.offset.set(pick(), pick());
  return tex;
}
