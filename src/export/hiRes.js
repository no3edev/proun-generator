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

// ---------------------------------------------------------------------------------------------------------------------------------
// Custom size and tiled rendering (Stage 7.5)
//
// "Custom size" asks for the LONGEST SIDE in pixels (the aspect ratio is the picture's). Up to the single-pass limits above it is the same
// renderAtScale as 2x / 4x. Beyond them (a side over 8192 px, over 36 megapixels, or over what the GPU gives) one big drawing buffer is
// not possible, so the picture is rendered in TILES: the same camera with a view offset (what each tile sees is that part of the full
// frame), the ground drawn for the same part, each tile copied into the output canvas at its place. Nothing else differs from a single
// pass, so the result is the picture, only larger.

/** Ceilings for a custom size (a browser's canvas limits make larger ones fail) and the side of a tile. */
export const CUSTOM_LIMITS = { maxSide: 16384, maxPixels: 100_000_000, tileSide: 4096 };

/**
 * @param {number} width   on-screen drawing-buffer width (what 1x is)
 * @param {number} height
 * @param {number} requested longest side wanted, px
 * @param {number} gpuMaxSide the largest drawing buffer side the GPU gives (for the single-pass decision)
 * @returns {{ width: number, height: number, scale: number, limited: boolean, tiled: boolean }}
 *   limited: capped below what was asked (or raised to the on-screen size); tiled: too big for one pass, so rendered in tiles
 */
export function clampCustomSize(width, height, requested, gpuMaxSide) {
  const longest = Math.max(width, height);
  const want = Number.isFinite(requested) && requested > 0 ? requested : longest;
  const byArea = Math.sqrt(CUSTOM_LIMITS.maxPixels / (width * height)) * longest;   // longest side at which the area is the ceiling
  const cap = Math.min(CUSTOM_LIMITS.maxSide, byArea);
  const target = Math.max(longest, Math.min(want, cap));
  const scale = target / longest;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const singleMax = Math.min(EXPORT_LIMITS.maxDim, gpuMaxSide);
  const tiled = Math.max(w, h) > singleMax || w * h > EXPORT_LIMITS.maxPixels;
  return { width: w, height: h, scale, limited: Math.abs(target - want) > 0.5, tiled };
}

/**
 * Splits width x height into tiles of at most `tileSide` per side: as few as possible, as equal as possible, exactly covering the
 * frame with no gap and no overlap. x, y are from the top left (what Camera.setViewOffset takes).
 * @param {number} width @param {number} height @param {number} tileSide
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
export function planTiles(width, height, tileSide) {
  /** @param {number} total */
  const cut = (total) => {
    const n = Math.max(1, Math.ceil(total / tileSide));
    const edges = [];
    for (let i = 0; i <= n; i++) edges.push(Math.round((total * i) / n));
    return edges;
  };
  const xs = cut(width), ys = cut(height);
  const tiles = [];
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) tiles.push({ x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] });
  return tiles;
}

/**
 * Where a tile sits in the ground's own coordinates (uv: 0..1 across the picture, y up): the offset of its bottom left corner and its
 * size, so the ground drawn for a tile is that part of the ground drawn for the whole.
 * @param {{ x: number, y: number, w: number, h: number }} tile @param {number} width @param {number} height
 * @returns {{ ox: number, oy: number, sx: number, sy: number }}
 */
export function groundTileUv(tile, width, height) {
  return { ox: tile.x / width, oy: 1 - (tile.y + tile.h) / height, sx: tile.w / width, sy: tile.h / height };
}

/**
 * Renders every tile and copies it into one output canvas.
 * @param {{ width: number, height: number, tiles: { x: number, y: number, w: number, h: number }[],
 *           renderTile: (tile: { x: number, y: number, w: number, h: number }, copy: (source: CanvasImageSource) => void) => void,
 *           createCanvas?: (w: number, h: number) => HTMLCanvasElement }} o
 *   renderTile draws the tile into the renderer's canvas and calls copy(thatCanvas) before returning
 * @returns {HTMLCanvasElement}
 */
export function renderTiles({ width, height, tiles, renderTile, createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } }) {
  const out = createCanvas(width, height);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas for the export');
  for (const t of tiles) renderTile(t, (source) => ctx.drawImage(source, 0, 0, t.w, t.h, t.x, t.y, t.w, t.h));
  return out;
}
