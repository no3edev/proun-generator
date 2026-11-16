import { clampExportScale, clampCustomSize, EXPORT_LIMITS, CUSTOM_LIMITS } from './hiRes.js';

// Exports the current composition as a PNG, optionally at 2x / 4x the
// on-screen resolution (see hiRes.js). Everything in the picture, the paper
// included, is drawn by WebGL (the ground is a shader, so it is sharper at
// 2x/4x, not softer), so the export is the renderer's canvas copied as it is:
// what is on screen is what is saved. (Until v0.14.0 a DOM paper overlay was
// multiplied over the stage and had to be drawn in here by hand.)

/**
 * Copies the rendered canvas into a new one: the renderer's own canvas is
 * restored to its on-screen size right after the draw callback, so the export
 * needs its own copy.
 * @param {{ source: HTMLCanvasElement, createCanvas?: () => HTMLCanvasElement }} args
 */
export function composeExport({ source, createCanvas = () => document.createElement('canvas') }) {
  const out = createCanvas();
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/** "proun-<seed>.png", "proun-<seed>@2x.png" above 1x, or "proun-<seed>@8000px.png" for a custom size (the longest side). */
export function exportFilename(seed, scale, longestPx) {
  const tag = longestPx ? `@${longestPx}px` : scale > 1 ? `@${Number(scale.toFixed(2))}x` : '';
  return `proun-${seed}${tag}.png`;
}

/**
 * @param {object} sceneManager
 * @param {{ scale?: number, size?: number, seed?: number, filename?: string, forceTiled?: boolean, tileSide?: number }} [options]
 *   scale: a multiple of the on-screen size (1, 2, 4); size: instead, the longest side in px (up to 16384 px and 100 megapixels), in
 *   tiles when it is too big for one pass; forceTiled / tileSide: for the tests and the tools
 * @returns {Promise<{ requested: number, scale: number, limited: boolean, width: number, height: number, tiled: boolean }>}
 */
export async function exportPNG(sceneManager, { scale = 1, size, seed, filename, forceTiled = false, tileSide } = {}) {
  if (sceneManager.contextStats && sceneManager.contextStats().lost) throw new Error('The graphics context was lost; wait a moment and try again');
  const renderer = sceneManager.getRenderer();
  const base = renderer.domElement;
  const gpuMax = sceneManager.getMaxRenderSize();
  const limits = { ...EXPORT_LIMITS, maxDim: Math.min(EXPORT_LIMITS.maxDim, gpuMax) };

  let out, eff, tiled = false, longest = null;
  if (size) {
    const c = clampCustomSize(base.width, base.height, size, gpuMax);
    tiled = c.tiled || forceTiled;
    eff = { scale: c.scale, limited: c.limited };
    longest = Math.max(c.width, c.height);
    out = tiled
      ? sceneManager.renderTiled(c.width, c.height, Math.min(tileSide || CUSTOM_LIMITS.tileSide, gpuMax))
      : sceneManager.renderScaled(c.scale, (canvas) => composeExport({ source: canvas }));
  } else {
    eff = clampExportScale(base.width, base.height, scale, limits);
    out = sceneManager.renderScaled(eff.scale, (canvas) => composeExport({ source: canvas }));
  }

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || exportFilename(seed ?? Date.now(), eff.scale, longest);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { requested: size || scale, scale: eff.scale, limited: eff.limited, width: out.width, height: out.height, tiled };
}
