import { clampExportScale, renderAtScale, EXPORT_LIMITS } from './hiRes.js';

// Exports the current composition as a PNG, optionally at 2x / 4x the
// on-screen resolution (see hiRes.js). The paper-grain overlay lives in a
// separate DOM layer applied via CSS mix-blend-mode, so it isn't part of the
// WebGL canvas — it has to be drawn in manually here, with the same blend
// mode and opacity, or the export won't match what's visible on screen. The
// overlay is stretched over the whole image exactly as CSS stretches it over
// the stage, so the grain keeps the same proportions at every scale.

/**
 * Draws the rendered scene plus the paper overlay into a new canvas.
 * @param {{ source: HTMLCanvasElement, overlay: HTMLCanvasElement | null,
 *           opacity: number, createCanvas?: () => HTMLCanvasElement }} args
 */
export function composeExport({ source, overlay, opacity, createCanvas = () => document.createElement('canvas') }) {
  const out = createCanvas();
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  ctx.drawImage(source, 0, 0, out.width, out.height);
  if (overlay) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = opacity;
    ctx.drawImage(overlay, 0, 0, out.width, out.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  return out;
}

/** "proun-<seed>.png", or "proun-<seed>@2x.png" above 1x. */
export function exportFilename(seed, scale) {
  const tag = scale > 1 ? `@${Number(scale.toFixed(2))}x` : '';
  return `proun-${seed}${tag}.png`;
}

/**
 * @param {object} sceneManager
 * @param {{ scale?: number, seed?: number, filename?: string }} [options]
 * @returns {Promise<{ requested: number, scale: number, limited: boolean, width: number, height: number }>}
 */
export async function exportPNG(sceneManager, { scale = 1, seed, filename } = {}) {
  const renderer = sceneManager.getRenderer();
  const base = renderer.domElement;
  const limits = { ...EXPORT_LIMITS, maxDim: Math.min(EXPORT_LIMITS.maxDim, sceneManager.getMaxRenderSize()) };
  const eff = clampExportScale(base.width, base.height, scale, limits);

  const out = sceneManager.renderScaled(eff.scale, (canvas) => composeExport({
    source: canvas,
    overlay: sceneManager.getOverlayCanvas(),
    opacity: sceneManager.getOverlayOpacity()
  }));

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || exportFilename(seed ?? Date.now(), eff.scale);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { requested: scale, scale: eff.scale, limited: eff.limited, width: out.width, height: out.height };
}
