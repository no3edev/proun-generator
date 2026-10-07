// Small canvas-based building blocks shared by the paper, pigment and
// micro-variation layers (see PaperTexture.js, PigmentLayer.js,
// MicroVariation.js). Everything here draws *structure* only —
// grayscale, always multiply-blended so it can only darken toward
// white's ceiling, never brighten past it. Color is never baked in
// here; it always comes from the palette system via material.color
// (see materials.js). Keeping that separation is what lets these
// structure canvases be built once and reused across every palette
// and every random accent color a shape ever gets.

/**
 * Multiply-blends a soft, blurred random field onto ctx: a low-res
 * grid of random gray values, scaled up with bilinear smoothing so it
 * reads as soft organic blobs rather than pixel noise. `amplitude` is
 * the max darkening below white, 0–1.
 */
export function blurredNoise(ctx, w, h, cells, amplitude) {
  const small = document.createElement('canvas');
  small.width = cells;
  small.height = cells;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(cells, cells);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 255 - Math.round(Math.random() * amplitude * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, w, h);
  ctx.restore();
}

/**
 * Multiply-blends a handful of soft radial blotches — pigment pooling
 * / coverage unevenness. Darkening only, same reasoning as above.
 */
export function softBlotches(ctx, w, h, count, opts = {}) {
  const minR = opts.minR ?? 0.05;
  const maxR = opts.maxR ?? 0.16;
  const minA = opts.minAlpha ?? 0.03;
  const maxA = opts.maxAlpha ?? 0.09;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = (minR + Math.random() * (maxR - minR)) * Math.max(w, h);
    const a = minA + Math.random() * (maxA - minA);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(0,0,0,${a})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Multiply-blends a few short, soft-edged strokes — just enough to
 * suggest a hand-applied coat, not painterly detail. Kept subtle on
 * purpose: the goal is clean geometric graphics that read as
 * physically applied, not visible brushwork.
 */
export function brushStrokes(ctx, w, h, count) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = (0.1 + Math.random() * 0.2) * Math.max(w, h);
    const angle = Math.random() * Math.PI;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    ctx.strokeStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.04})`;
    ctx.lineWidth = (0.015 + Math.random() * 0.02) * Math.max(w, h);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Faint, mostly-horizontal-drift lines — paper's directional fiber
 * grain. Darkening only (see module note), very low opacity; meant to
 * be felt more than consciously seen.
 */
export function fiberLines(ctx, w, h, count) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = (0.15 + Math.random() * 0.35) * Math.max(w, h);
    const angle = (Math.random() - 0.5) * 0.6;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    ctx.strokeStyle = `rgba(0,0,0,${0.015 + Math.random() * 0.02})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Per-pixel micro jitter — the thinnest possible layer, meant to break
 * up flat digital color without reading as visible "grain". Unlike
 * the layers above this can nudge brighter as well as darker (it's
 * not standing in for a physical material, just breaking uniformity),
 * but the amplitude should stay tiny. Kept as its own pass — see
 * MicroVariation.js — so it's the one clean seam to swap for an
 * animated shader uniform later.
 */
export function microJitter(ctx, w, h, amplitude) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amplitude * 255;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}
