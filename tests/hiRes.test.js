// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { clampExportScale, renderAtScale, EXPORT_LIMITS, EXPORT_SCALES } from '../src/export/hiRes.js';
import { composeExport, exportFilename, exportPNG } from '../src/export/PngExporter.js';

describe('clampExportScale', () => {
  const L = { maxDim: 8192, maxPixels: 36_000_000 };

  it('passes through a scale that fits', () => {
    expect(clampExportScale(1440, 1120, 2, L)).toEqual({ scale: 2, limited: false, width: 2880, height: 2240 });
    expect(clampExportScale(720, 560, 4, L)).toEqual({ scale: 4, limited: false, width: 2880, height: 2240 });
  });

  it('1x is exactly what is on screen', () => {
    expect(clampExportScale(1440, 1120, 1, L)).toEqual({ scale: 1, limited: false, width: 1440, height: 1120 });
  });

  it('caps by the longest side', () => {
    const r = clampExportScale(4000, 1000, 4, { maxDim: 8192, maxPixels: 1e12 });
    expect(r.limited).toBe(true);
    expect(r.width).toBeLessThanOrEqual(8192);
    expect(r.scale).toBeCloseTo(2.04, 2);
  });

  it('caps by total pixels', () => {
    const r = clampExportScale(3000, 3000, 4, { maxDim: 1e9, maxPixels: 36_000_000 });
    expect(r.limited).toBe(true);
    expect(r.width * r.height).toBeLessThanOrEqual(36_000_000);
  });

  it('never goes below 1x, even if the screen is already over the limits', () => {
    const r = clampExportScale(9000, 9000, 4, L);
    expect(r.scale).toBe(1);
    expect(r.limited).toBe(true);
  });

  it('treats junk as 1x', () => {
    for (const bad of [0, -3, NaN, undefined, null, Infinity * 0, 0.5]) {
      expect(clampExportScale(100, 100, bad, L).scale).toBe(1);
    }
  });

  it('the offered scales fit a typical retina stage', () => {
    // 720x560 stage at devicePixelRatio 2 (what the app produces) -> 4x must not be capped
    EXPORT_SCALES.forEach((k) => expect(clampExportScale(1440, 1120, k, EXPORT_LIMITS).limited).toBe(false));
  });
});

describe('renderAtScale', () => {
  function fakeRenderer(log, { ratio = 2, size = { x: 720, y: 560 } } = {}) {
    return {
      domElement: { id: 'canvas' },
      getPixelRatio: () => ratio,
      getSize: (target) => { target.x = size.x; target.y = size.y; return target; },
      setPixelRatio: (r) => log.push(['ratio', r]),
      setSize: (w, h, style) => log.push(['size', w, h, style])
    };
  }

  it('at 1x it renders once and does not touch the renderer\'s size', () => {
    const log = [];
    const r = fakeRenderer(log);
    const out = renderAtScale(r, 1, () => log.push(['render']), (c) => { log.push(['draw']); return c.id; });
    expect(out).toBe('canvas');
    expect(log).toEqual([['render'], ['draw']]);
  });

  it('at 2x: raise the ratio, never touch the CSS size, render, draw, then restore and re-render', () => {
    const log = [];
    const out = renderAtScale(fakeRenderer(log), 2, () => log.push(['render']), () => { log.push(['draw']); return 'result'; });
    expect(out).toBe('result');
    expect(log).toEqual([
      ['ratio', 4], ['size', 720, 560, false], ['render'], ['draw'],
      ['ratio', 2], ['size', 720, 560, false], ['render']
    ]);
  });

  it('passes updateStyle=false every time (the on-screen stage must not resize or flicker)', () => {
    const log = [];
    renderAtScale(fakeRenderer(log), 4, () => {}, () => {});
    log.filter((e) => e[0] === 'size').forEach((e) => expect(e[3]).toBe(false));
  });

  it('restores the renderer even if drawing throws, and rethrows', () => {
    const log = [];
    expect(() => renderAtScale(fakeRenderer(log), 2, () => log.push(['render']), () => { throw new Error('draw failed'); }))
      .toThrow('draw failed');
    expect(log.slice(-3)).toEqual([['ratio', 2], ['size', 720, 560, false], ['render']]);
  });

  it('restores the renderer even if rendering throws', () => {
    const log = [];
    let calls = 0;
    expect(() => renderAtScale(fakeRenderer(log), 2, () => { if (calls++ === 0) throw new Error('GL lost'); }, () => {})).toThrow('GL lost');
    expect(log.slice(-2)).toEqual([['ratio', 2], ['size', 720, 560, false]]);
  });

  it('scales from the CURRENT ratio (a 3x display exports 3x -> 6x, not 1x -> 2x)', () => {
    const log = [];
    renderAtScale(fakeRenderer(log, { ratio: 3 }), 2, () => {}, () => {});
    expect(log[0]).toEqual(['ratio', 6]);
  });
});

describe('composeExport', () => {
  function fakeCanvas() {
    const calls = [];
    const ctx = {
      drawImage: (...a) => calls.push(['draw', a[0].tag, a[1], a[2], a[3], a[4], ctx.globalCompositeOperation, ctx.globalAlpha]),
      globalCompositeOperation: 'source-over', globalAlpha: 1
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx };
    return { canvas, ctx, calls };
  }

  it('draws the scene, then the overlay multiplied at the overlay opacity, then resets the context', () => {
    const { canvas, ctx, calls } = fakeCanvas();
    const out = composeExport({
      source: { tag: 'scene', width: 2880, height: 2240 }, overlay: { tag: 'grain' }, opacity: 0.5, createCanvas: () => canvas
    });
    expect(out).toBe(canvas);
    expect([out.width, out.height]).toEqual([2880, 2240]);
    expect(calls).toEqual([
      ['draw', 'scene', 0, 0, 2880, 2240, 'source-over', 1],
      ['draw', 'grain', 0, 0, 2880, 2240, 'multiply', 0.5]   // stretched over the whole image, like CSS "cover"
    ]);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.globalAlpha).toBe(1);
  });

  it('with no overlay it just copies the scene', () => {
    const { canvas, calls } = fakeCanvas();
    composeExport({ source: { tag: 'scene', width: 10, height: 10 }, overlay: null, opacity: 0.5, createCanvas: () => canvas });
    expect(calls).toHaveLength(1);
  });

  it('fails loudly if no 2D context is available', () => {
    expect(() => composeExport({
      source: { width: 1, height: 1 }, overlay: null, opacity: 1, createCanvas: () => ({ getContext: () => null })
    })).toThrow(/2D canvas/);
  });
});

describe('exportFilename', () => {
  it('names the file after the seed, and tags the scale above 1x', () => {
    expect(exportFilename(1234, 1)).toBe('proun-1234.png');
    expect(exportFilename(1234, 2)).toBe('proun-1234@2x.png');
    expect(exportFilename(1234, 2.04123)).toBe('proun-1234@2.04x.png');
  });
});

describe('exportPNG', () => {
  // like the real SceneManager: renders at `scale`, then returns what `draw` builds
  function sceneManager({ width = 1440, height = 1120, max = 16384 } = {}) {
    const rendered = [];
    return {
      rendered,
      getRenderer: () => ({ domElement: { width, height } }),
      getMaxRenderSize: () => max,
      getOverlayCanvas: () => null,
      getOverlayOpacity: () => 0.5,
      renderScaled: (scale, draw) => {
        rendered.push(scale);
        return draw({ width: Math.floor(width * scale), height: Math.floor(height * scale) });
      }
    };
  }
  // composeExport needs a real canvas; give it one via a stubbed createElement
  function stubDom() {
    const real = document.createElement.bind(document);
    const clicks = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return { width: 0, height: 0, getContext: () => ({ drawImage() {}, globalCompositeOperation: '', globalAlpha: 1 }), toBlob: (cb) => cb(new Blob(['png'])) };
      }
      const el = real(tag);
      if (tag === 'a') el.click = () => clicks.push({ href: el.href, download: el.download });
      return el;
    });
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    return clicks;
  }

  it('downloads a file named for the seed and scale, and reports what it wrote', async () => {
    const clicks = stubDom();
    const sm = sceneManager();
    const r = await exportPNG(sm, { scale: 2, seed: 4242 });
    expect(sm.rendered).toEqual([2]);
    expect(r).toMatchObject({ requested: 2, scale: 2, limited: false, width: 2880, height: 2240 });
    expect(clicks).toEqual([{ href: 'blob:fake', download: 'proun-4242@2x.png' }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.restoreAllMocks();
  });

  it('caps the scale to what the GPU can render, and says so', async () => {
    stubDom();
    const sm = sceneManager({ width: 1440, height: 1120, max: 4096 });
    const r = await exportPNG(sm, { scale: 4, seed: 1 });
    expect(r.limited).toBe(true);
    expect(r.requested).toBe(4);
    expect(r.scale).toBeLessThan(4);
    expect(r.width).toBeLessThanOrEqual(4096);
    expect(sm.rendered[0]).toBe(r.scale);
    vi.restoreAllMocks();
  });

  it('1x writes exactly what is on screen', async () => {
    stubDom();
    const sm = sceneManager();
    const r = await exportPNG(sm, { scale: 1, seed: 7 });
    expect(r).toMatchObject({ scale: 1, limited: false, width: 1440, height: 1120 });
    vi.restoreAllMocks();
  });

  it('rejects (and downloads nothing) if PNG encoding fails', async () => {
    const real = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => tag === 'canvas'
      ? { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (cb) => cb(null) }
      : real(tag));
    await expect(exportPNG(sceneManager(), { scale: 1, seed: 1 })).rejects.toThrow(/PNG encoding/);
    vi.restoreAllMocks();
  });
});
