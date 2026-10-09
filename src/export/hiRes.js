// @ts-check
// Hi-res export support, kept free of the real renderer so it can be tested.
//
// The export renders the SAME live renderer at a higher pixel ratio and then
// puts everything back — the identical pipeline to what's on screen (same
// color management, same antialiasing, nothing to flip or re-encode), just
// with more pixels. "1×" means exactly what's on screen; 2× / 4× are
// multiples of that, so what you get is always a clean scale-up of the view.

import * as THREE from 'three';

export const EXPORT_SCALES = [1, 2, 4];

/**
 * Upper bounds so a huge export can't exhaust GPU memory (a multisampled
 * drawing buffer costs several times its pixel count): longest side and
 * total pixels. SceneManager lowers maxDim to what the GPU reports.
 */
export const EXPORT_LIMITS = { maxDim: 8192, maxPixels: 36_000_000 };

/**
 * The scale actually used for a requested one: the largest value up to
 * `requested` that keeps the output within `limits`, and never below 1.
 * @param {number} width   on-screen drawing-buffer width (what 1× is)
 * @param {number} height
 * @param {number} requested
 * @param {{ maxDim: number, maxPixels: number }} [limits]
 * @returns {{ scale: number, limited: boolean, width: number, height: number }}
 */
export function clampExportScale(width, height, requested, limits = EXPORT_LIMITS) {
  const want = Number.isFinite(requested) && requested > 1 ? requested : 1;
  const byDim = limits.maxDim / Math.max(width, height);
  const byArea = Math.sqrt(limits.maxPixels / (width * height));
  const cap = Math.max(1, Math.floor(Math.min(byDim, byArea) * 100) / 100);
  const scale = Math.min(want, cap);
  return {
    scale,
    limited: scale < want,
    width: Math.floor(width * scale),
    height: Math.floor(height * scale)
  };
}

/**
 * Renders at `scale` x the current resolution, hands the canvas to `draw`
 * (synchronously — the drawing buffer is only valid right now), and ALWAYS
 * restores the renderer afterwards, even if `draw` throws. The CSS size is
 * never touched (setSize's updateStyle is false), so the stage doesn't
 * resize or flicker.
 *
 * @template T
 * @param {{ getPixelRatio(): number, setPixelRatio(r: number): void,
 *           getSize(target: THREE.Vector2): THREE.Vector2,
 *           setSize(w: number, h: number, updateStyle?: boolean): void,
 *           domElement: HTMLCanvasElement }} renderer
 * @param {number} scale
 * @param {() => void} render  renders one frame into the renderer's canvas
 * @param {(canvas: HTMLCanvasElement) => T} draw
 * @returns {T}
 */
export function renderAtScale(renderer, scale, render, draw) {
  if (scale === 1) {
    render(); // make sure the buffer holds the current frame
    return draw(renderer.domElement);
  }
  const ratio = renderer.getPixelRatio();
  const size = renderer.getSize(new THREE.Vector2());
  try {
    renderer.setPixelRatio(ratio * scale);
    renderer.setSize(size.x, size.y, false);
    render();
    return draw(renderer.domElement);
  } finally {
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.x, size.y, false);
    render();
  }
}
