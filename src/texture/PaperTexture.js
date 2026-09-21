// Procedural grain: fine noise + a few soft blotches, tinted from a
// base color. Used both as a CSS overlay (whole stage) and baked into
// shape materials, so there's no external asset pipeline (yet).

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return {
    r: parseInt(v.substring(0, 2), 16),
    g: parseInt(v.substring(2, 4), 16),
    b: parseInt(v.substring(4, 6), 16)
  };
}

export function clamp8(v) {
  return Math.max(0, Math.min(255, v));
}

/**
 * @param {number} w canvas width
 * @param {number} h canvas height
 * @param {string} baseHex base color, e.g. '#e9e4d8'
 * @param {{noiseStrength?: number, blotches?: number}} opts
 * @returns {HTMLCanvasElement}
 */
export function makeGrainCanvas(w, h, baseHex, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const base = hexToRgb(baseHex);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const noiseStrength = opts.noiseStrength || 14;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * noiseStrength;
    d[i] = clamp8(base.r + n);
    d[i + 1] = clamp8(base.g + n);
    d[i + 2] = clamp8(base.b + n);
    d[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // soft blotches for a watercolor feel
  const blotches = opts.blotches || 10;
  for (let i = 0; i < blotches; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = (0.08 + Math.random() * 0.18) * Math.max(w, h);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = Math.random() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    grad.addColorStop(0, shade);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}
