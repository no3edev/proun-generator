import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import frame, { frameShape, frameGeometry, FRAME_ASPECT, FRAME_BORDER } from '../src/shapes/frame.js';
import ring, { ringShape, ringGeometry, RING_BAND, RING_SWEEP } from '../src/shapes/ring.js';
import { getShape } from '../src/shapes/registry.js';
import { createRng } from '../src/generator/rng.js';
import { screenBasis, hexToHsl, splitPalette } from '../src/generator/strategies/common.js';
import { each, makeConfig, layoutOf, depthAxis, palettes, shapeRegistry } from './helpers/scene.js';

const basis = screenBasis(depthAxis);
const axisCfg = (seed, counts, opts) => ({ ...makeConfig(seed, counts, opts), composition: { strategy: 'axis-thrust' }, orientation: 'landscape' });
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const outlines = each(1, { frame: 1, ring: 1 });

const polyArea = (pts) => Math.abs(THREE.ShapeUtils.area(pts));
/** even-odd point test over every contour of a shape (its outline and its holes) */
function solid(shape, x, y) {
  const { shape: outer, holes } = shape.extractPoints(200);
  let c = false;
  for (const poly of [outer, ...holes]) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
  }
  return c;
}
const bbox = (geo) => { geo.computeBoundingBox(); return geo.boundingBox; };

describe.each([['frame', frame, frameGeometry], ['ring', ring, ringGeometry]])('%s: the shape', (name, shape, geometry) => {
  it('is registered, flat, off by default, and does not collide (an outline crosses other forms on purpose)', () => {
    expect(getShape(name)).toBe(shape);
    expect(shape.facesCamera).toBe(false);
    expect(shape.collides).toBe(false);
    expect(shape.defaults).toEqual({ count: 0 });
  });

  it('builds finite geometry inside its declared envelope', () => {
    const geo = geometry();
    const pos = geo.getAttribute('position');
    expect(pos.count).toBeGreaterThan(50);
    for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
    const b = bbox(geo), he = shape.localHalfExtents;
    expect(b.max.x).toBeLessThanOrEqual(he.x + 1e-6);
    expect(b.min.x).toBeGreaterThanOrEqual(-he.x - 1e-6);
    expect(b.max.y).toBeLessThanOrEqual(he.y + 1e-6);
    expect(b.min.y).toBeGreaterThanOrEqual(-he.y - 1e-6);
    expect(b.max.z).toBeCloseTo(he.z, 6);
    expect(b.min.z).toBeCloseTo(-he.z, 6);
    expect(geo.groups.length).toBe(2);
  });

  it('scales uniformly in x and y (so the line weight stays in proportion), is thin in z, and is reproducible', () => {
    for (let i = 0; i < 200; i++) {
      const s = shape.randomScale(createRng(4, name, 'scale', i));
      expect(s.x).toBe(s.y);
      expect(s.z).toBeGreaterThan(0);
      expect(s.z).toBeLessThanOrEqual(1);
    }
    expect(shape.randomScale(createRng(2, name, 'a', 0)).toArray()).toEqual(shape.randomScale(createRng(2, name, 'a', 0)).toArray());
  });
});

describe('frame: the outline', () => {
  const s = frameShape();
  it('is an open rectangle: the right area, with a real hole', () => {
    const w = 1, h = FRAME_ASPECT, b = FRAME_BORDER;
    const analytic = w * h - (w - 2 * b) * (h - 2 * b);
    const { shape: outer, holes } = s.extractPoints(50);
    expect(holes).toHaveLength(1);
    expect(polyArea(outer) - polyArea(holes[0])).toBeCloseTo(analytic, 6);
  });
  it('is solid on its border and empty inside, and the envelope is its own', () => {
    expect(solid(s, 0, 0)).toBe(false);
    expect(solid(s, 0, FRAME_ASPECT / 2 - FRAME_BORDER / 2)).toBe(true);
    expect(solid(s, 0.5 - FRAME_BORDER / 2, 0)).toBe(true);
    expect(solid(s, 0.6, 0)).toBe(false);
    const b = bbox(frameGeometry());
    expect(b.max.x).toBeCloseTo(0.5, 6);
    expect(b.max.y).toBeCloseTo(FRAME_ASPECT / 2, 6);
  });
});

describe('ring: the outline', () => {
  const s = ringShape();
  it('is an arc band: the right area (a 270 degree sector of an annulus)', () => {
    const R = 0.5, r = 0.5 - RING_BAND;
    const analytic = 0.5 * RING_SWEEP * (R * R - r * r);
    expect(polyArea(s.extractPoints(300).shape) / analytic).toBeGreaterThan(0.995);
    expect(polyArea(s.extractPoints(300).shape) / analytic).toBeLessThan(1.005);
  });
  it('has its opening on +x and the band elsewhere', () => {
    const mid = 0.5 - RING_BAND / 2;
    expect(solid(s, mid, 0)).toBe(false);             // the opening
    expect(solid(s, -mid, 0)).toBe(true);
    expect(solid(s, 0, mid)).toBe(true);
    expect(solid(s, 0, -mid)).toBe(true);
    expect(solid(s, 0, 0)).toBe(false);               // hollow
  });
  it('keeps its origin at the circle\'s centre, so placing the shape places the circle', () => {
    const b = bbox(ringGeometry());
    expect(b.min.x).toBeCloseTo(-0.5, 3);
    expect(b.min.y).toBeCloseTo(-0.5, 3);
    expect(b.max.y).toBeCloseTo(0.5, 3);
    expect(b.max.x).toBeCloseTo(0.5 * Math.cos(Math.PI / 4), 2); // the opening cuts the +x side
  });
});

describe('frame and ring: in the legacy generator', () => {
  it('enabling them leaves every other type\'s candidate alone, and they pass through the others (no pushing)', () => {
    const base = layoutOf(makeConfig(9, each(1)));
    const withOutlines = layoutOf(makeConfig(9, each(1, { frame: 2, ring: 2 })));
    expect(withOutlines.filter((e) => e.type === 'frame')).toHaveLength(2);
    expect(withOutlines.filter((e) => e.type === 'ring')).toHaveLength(2);
    expect(withOutlines.filter((e) => e.type !== 'frame' && e.type !== 'ring').map((e) => `${e.type}:${e.index}:${e.hex}`))
      .toEqual(base.map((e) => `${e.type}:${e.index}:${e.hex}`));
    // they do not collide, so they do not move the others in depth
    withOutlines.filter((e) => e.type !== 'frame' && e.type !== 'ring').forEach((e, i) => expect(e.position).toEqual(base[i].position));
  });
});

describe('frame and ring: in Axis thrust', () => {
  const angleOf = (e) => {
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation)));
    return ((Math.atan2(x.dot(basis.up), x.dot(basis.right)) * 180) / Math.PI + 180) % 180;
  };
  const apart = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
  const screenOf = (e) => { const p = new THREE.Vector3(...e.position); return [p.dot(basis.right), p.dot(basis.up)]; };

  it('are off unless enabled', () => {
    SEEDS.forEach((seed) => layoutOf(axisCfg(seed, each(1))).forEach((e) => expect(['frame', 'ring']).not.toContain(e.type)));
  });

  it('appear when enabled, at most one of each, as details', () => {
    const all = SEEDS.map((seed) => layoutOf(axisCfg(seed, outlines)));
    expect(all.some((L) => L.some((e) => e.type === 'frame'))).toBe(true);
    expect(all.some((L) => L.some((e) => e.type === 'ring'))).toBe(true);
    all.forEach((L) => {
      expect(L.filter((e) => e.type === 'frame').length).toBeLessThanOrEqual(1);
      expect(L.filter((e) => e.type === 'ring').length).toBeLessThanOrEqual(1);
      L.filter((e) => e.type === 'frame' || e.type === 'ring').forEach((e) => expect(e.role).toBe('detail'));
    });
  });

  it('a frame\'s long side runs along the axis (or across it), the ring is centred near the anchor', () => {
    let frames = 0, rings = 0;
    SEEDS.forEach((seed) => {
      const L = layoutOf(axisCfg(seed, outlines));
      const beams = L.filter((e) => e.role === 'support');
      const anchor = L.find((e) => e.role === 'anchor');
      L.filter((e) => e.type === 'frame').forEach((f) => {
        if (!beams.length) return;
        frames++;
        const d = Math.min(...beams.map((b) => apart(angleOf(f), angleOf(b))), ...beams.map((b) => apart(angleOf(f), (angleOf(b) + 90) % 180)));
        expect(d).toBeLessThanOrEqual(15 + 1e-6); // beams wander up to 9, the frame up to 6, from the axis
      });
      L.filter((e) => e.type === 'ring').forEach((rg) => {
        rings++;
        const [ax, ay] = screenOf(anchor), [rx, ry] = screenOf(rg);
        expect(Math.abs(rx - ax)).toBeLessThanOrEqual(0.2 * 3 * (720 / 560) + 1e-6);
        expect(Math.abs(ry - ay)).toBeLessThanOrEqual(0.2 * 3 + 1e-6);
      });
    });
    expect(frames).toBeGreaterThan(0);
    expect(rings).toBeGreaterThan(0);
  });

  it('keeps the structure and one saturated hue on every palette, and stays visible against the anchor', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const { saturated } = splitPalette(palette);
      SEEDS.slice(0, 15).forEach((seed) => {
        const L = layoutOf(axisCfg(seed, outlines), name);
        expect(L.filter((e) => e.role === 'anchor'), `${name} ${seed}`).toHaveLength(1);
        const hues = new Set(L.map((e) => e.hex).filter((h) => hexToHsl(h).s >= 0.5));
        expect(hues.size).toBeLessThanOrEqual(1);
        hues.forEach((h) => expect(saturated).toContain(h));
        const anchor = L.find((e) => e.role === 'anchor');
        L.filter((e) => e.type === 'frame' || e.type === 'ring').forEach((o) => expect(o.hex, `${name} ${seed}`).not.toBe(anchor.hex));
      });
    }
  });

  it('is reproducible and well-formed', () => {
    expect(layoutOf(axisCfg(5, outlines))).toEqual(layoutOf(axisCfg(5, outlines)));
    SEEDS.forEach((seed) => layoutOf(axisCfg(seed, outlines)).forEach((e) => {
      [...e.position, ...e.rotation, ...e.scale].forEach((v) => expect(Number.isFinite(v)).toBe(true));
    }));
  });

  it('a registry-wide check: every shape keeps the contract with the two new ones in', () => {
    expect(new Set(shapeRegistry.map((s) => s.type)).size).toBe(shapeRegistry.length);
    expect(shapeRegistry.map((s) => s.type)).toEqual(expect.arrayContaining(['frame', 'ring']));
  });
});
