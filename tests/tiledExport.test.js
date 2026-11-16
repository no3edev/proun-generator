import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CUSTOM_LIMITS, EXPORT_LIMITS, clampCustomSize, planTiles, groundTileUv, renderTiles } from '../src/export/hiRes.js';
import { exportFilename } from '../src/export/PngExporter.js';
import { initGround, updateGroundCache, setGroundTile, groundSignature } from '../src/texture/GroundLayer.js';

// Stage 7.5: a custom export size (the longest side in px, up to 16384 px and 100 megapixels), rendered in tiles when one drawing
// buffer cannot hold it.

describe('clampCustomSize', () => {
  const GPU = 16384;
  it('gives the asked longest side, keeping the picture\'s aspect ratio', () => {
    const c = clampCustomSize(720, 560, 8000, GPU);
    expect(Math.max(c.width, c.height)).toBe(8000);
    expect(c.width / c.height).toBeCloseTo(720 / 560, 3);
    expect(c.limited).toBe(false);
    const p = clampCustomSize(560, 720, 3000, GPU);
    expect(p.height).toBe(3000); expect(p.width / p.height).toBeCloseTo(560 / 720, 3);
  });

  it('is capped at 16384 px a side and 100 megapixels, and says so', () => {
    const big = clampCustomSize(720, 560, 50_000, GPU);
    expect(Math.max(big.width, big.height)).toBeLessThanOrEqual(CUSTOM_LIMITS.maxSide);
    expect(big.width * big.height).toBeLessThanOrEqual(CUSTOM_LIMITS.maxPixels * 1.0001);
    expect(big.limited).toBe(true);
    const square = clampCustomSize(640, 640, 16384, GPU);          // 16384 x 16384 would be 268 MP
    expect(square.width * square.height).toBeLessThanOrEqual(CUSTOM_LIMITS.maxPixels * 1.0001);
    expect(square.width).toBeCloseTo(10000, -1);
    expect(square.limited).toBe(true);
    for (const [w, h] of [[720, 560], [560, 720], [640, 640], [1388, 1080], [3840, 2160]]) {
      const c = clampCustomSize(w, h, 1e9, GPU);
      expect(Math.max(c.width, c.height)).toBeLessThanOrEqual(16384);
      expect(c.width * c.height).toBeLessThanOrEqual(CUSTOM_LIMITS.maxPixels * 1.0001);
    }
  });

  it('is never smaller than the picture on screen, and survives nonsense', () => {
    expect(Math.max(clampCustomSize(720, 560, 100, GPU).width, 0)).toBe(720);
    expect(clampCustomSize(720, 560, 100, GPU).limited).toBe(true);
    for (const bad of [NaN, -5, 0, undefined, Infinity]) {
      const c = clampCustomSize(720, 560, bad, GPU);
      expect(c.width).toBeGreaterThan(0); expect(c.height).toBeGreaterThan(0); expect(Number.isFinite(c.scale)).toBe(true);
    }
  });

  it('is a single pass while it fits (8192 px, 36 megapixels, the GPU), and tiled beyond', () => {
    expect(clampCustomSize(720, 560, 2880, GPU).tiled).toBe(false);          // 4x
    expect(clampCustomSize(720, 560, 6000, GPU).tiled).toBe(false);          // 6000 x 4667 = 28 MP
    expect(clampCustomSize(720, 560, 7000, GPU).tiled).toBe(true);           // 7000 x 5444 = 38 MP
    expect(clampCustomSize(720, 560, 8192, GPU).tiled).toBe(true);
    expect(clampCustomSize(640, 640, 6000, GPU).tiled).toBe(false);          // 36 MP exactly
    expect(clampCustomSize(720, 560, 9000, GPU).tiled).toBe(true);           // a side over 8192
    expect(clampCustomSize(720, 560, 4000, 2048).tiled).toBe(true);          // a GPU that gives only 2048
    expect(EXPORT_LIMITS.maxDim).toBe(8192);
  });
});

describe('planTiles', () => {
  it('covers the frame exactly: no gap, no overlap, no tile larger than asked, as few as possible', () => {
    for (const [w, h, side] of [[8000, 6222, 4096], [16384, 12745, 4096], [5000, 5000, 4096], [4096, 4096, 4096], [4097, 100, 4096], [100, 9000, 4096], [1, 1, 4096], [10000, 10000, 1500], [7919, 6007, 1024]]) {
      const tiles = planTiles(w, h, side);
      for (const t of tiles) {
        expect(t.w).toBeGreaterThan(0); expect(t.h).toBeGreaterThan(0);
        expect(t.w).toBeLessThanOrEqual(side); expect(t.h).toBeLessThanOrEqual(side);
      }
      // the tiles are a grid of rows: each row's tiles run on from x = 0 to the full width with equal heights, and the rows run on from
      // y = 0 to the full height: that is an exact cover (no gap, no overlap)
      const rows = new Map();
      for (const t of tiles) { if (!rows.has(t.y)) rows.set(t.y, []); rows.get(t.y).push(t); }
      let y = 0;
      for (const [ry, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
        expect(ry, `${w}x${h}`).toBe(y);
        row.sort((a, b) => a.x - b.x);
        let x = 0;
        for (const t of row) { expect(t.x, `${w}x${h}`).toBe(x); expect(t.h).toBe(row[0].h); x += t.w; }
        expect(x, `${w}x${h}`).toBe(w);
        y += row[0].h;
      }
      expect(y, `${w}x${h}`).toBe(h);
      expect(tiles.reduce((a, t) => a + t.w * t.h, 0), `${w}x${h}`).toBe(w * h);
      expect(tiles.length).toBe(Math.ceil(w / side) * Math.ceil(h / side));
    }
  });

  it('makes tiles as equal as it can (no sliver of 1 px beside a big tile)', () => {
    for (const [total, side] of [[8193, 4096], [10001, 4096], [4097, 4096], [12289, 4096]]) {
      const widths = planTiles(total, 100, side).map((t) => t.w);
      expect(Math.max(...widths) - Math.min(...widths), `${total}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('groundTileUv: the ground is drawn for the same part of the picture as the tile', () => {
  it('the tiles\' uv rectangles tile the unit square exactly (y up, the tile list is from the top left)', () => {
    const W = 8000, H = 6222;
    const tiles = planTiles(W, H, 4096);
    let area = 0;
    for (const t of tiles) {
      const u = groundTileUv(t, W, H);
      expect(u.ox).toBeGreaterThanOrEqual(0); expect(u.oy).toBeGreaterThanOrEqual(-1e-12);
      expect(u.ox + u.sx).toBeLessThanOrEqual(1 + 1e-12); expect(u.oy + u.sy).toBeLessThanOrEqual(1 + 1e-12);
      area += u.sx * u.sy;
    }
    expect(area).toBeCloseTo(1, 12);
    // the top left tile is the TOP of the ground (uv y near 1), the bottom left tile is its bottom (uv y 0)
    expect(groundTileUv(tiles[0], W, H).oy + groundTileUv(tiles[0], W, H).sy).toBeCloseTo(1, 12);
    expect(groundTileUv(tiles[tiles.length - 1], W, H).oy).toBeCloseTo(0, 12);
    expect(groundTileUv({ x: 0, y: 0, w: W, h: H }, W, H)).toEqual({ ox: 0, oy: 0, sx: 1, sy: 1 });
  });
});

describe('renderTiles', () => {
  /** a canvas double that records where each piece was drawn */
  const fakeCanvas = (w, h) => { const draws = []; return { width: w, height: h, draws, getContext: () => ({ drawImage: (...a) => draws.push(a) }) }; };

  it('renders each tile once and puts it at its own place in the output', () => {
    const tiles = planTiles(5000, 3000, 2048);
    const seen = [];
    const out = renderTiles({ width: 5000, height: 3000, tiles, createCanvas: fakeCanvas, renderTile: (t, copy) => { seen.push(t); copy({ source: 'tile' }); } });
    expect(seen).toEqual(tiles);
    expect(out.width).toBe(5000); expect(out.height).toBe(3000);
    expect(out.draws.length).toBe(tiles.length);
    out.draws.forEach((a, i) => expect(a.slice(1)).toEqual([0, 0, tiles[i].w, tiles[i].h, tiles[i].x, tiles[i].y, tiles[i].w, tiles[i].h]));
  });

  it('lets an error in a tile out (the caller restores the renderer in a finally)', () => {
    expect(() => renderTiles({ width: 10, height: 10, tiles: planTiles(10, 10, 4), createCanvas: fakeCanvas, renderTile: () => { throw new Error('boom'); } })).toThrow('boom');
    expect(() => renderTiles({ width: 10, height: 10, tiles: [], createCanvas: () => ({ width: 10, height: 10, getContext: () => null }), renderTile: () => {} })).toThrow(/2D canvas/);
  });
});

describe('the ground cache and the tile uniform', () => {
  function fakeRenderer() {
    const r = { draws: 0, target: null, size: new THREE.Vector2(200, 150) };
    r.getDrawingBufferSize = (v) => v.copy(r.size);
    r.getRenderTarget = () => r.target; r.setRenderTarget = (t) => { r.target = t; }; r.render = () => { r.draws++; };
    return r;
  }
  it('a new tile is a new picture (the cache redraws), the same tile is not, and null is the whole picture again', () => {
    initGround(new THREE.Scene());
    const r = fakeRenderer();
    expect(updateGroundCache(r)).toBe(true);
    expect(updateGroundCache(r)).toBe(false);
    const whole = groundSignature();
    setGroundTile({ ox: 0.5, oy: 0, sx: 0.5, sy: 0.5 });
    expect(groundSignature()).not.toEqual(whole);
    expect(updateGroundCache(r)).toBe(true);
    expect(updateGroundCache(r)).toBe(false);
    setGroundTile({ ox: 0, oy: 0.5, sx: 0.5, sy: 0.5 });
    expect(updateGroundCache(r)).toBe(true);
    setGroundTile({ ox: 0, oy: 0, sx: 0.5, sy: 0.5 });             // the same corner as the whole picture, only smaller: still a new picture
    expect(groundSignature()).not.toEqual(whole);
    expect(updateGroundCache(r)).toBe(true);
    setGroundTile(null);
    expect(groundSignature()).toEqual(whole);
    expect(updateGroundCache(r)).toBe(true);                       // drawn once more for the whole picture
    expect(updateGroundCache(r)).toBe(false);
  });
});

describe('the filename of a custom size', () => {
  it('carries the longest side; the multiples are as they were', () => {
    expect(exportFilename(42, 1)).toBe('proun-42.png');
    expect(exportFilename(42, 2)).toBe('proun-42@2x.png');
    expect(exportFilename(42, 5.5555, 8000)).toBe('proun-42@8000px.png');
  });
});
