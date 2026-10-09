import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { generateLayout, buildCandidate } from '../src/generator/generate.js';
import { computeAABB } from '../src/generator/CollisionResolver.js';
import { BOUNDS } from '../src/config/defaults.js';

const boxShape = (type, facesCamera = false) => ({
  type,
  facesCamera,
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
  randomScale: (rng) => new THREE.Vector3(0.5 + rng(), 0.5 + rng(), 0.5 + rng())
});
const shapeDefs = [boxShape('a'), boxShape('b'), boxShape('c', true)];
const palette = { accents: ['#111111', '#222222', '#333333', '#444444'] };
const view = {
  depthAxis: new THREE.Vector3(4.2, 3.4, 5.2).normalize(),
  billboard: new THREE.Quaternion()
};
const cfg = (seed, counts = { a: 3, b: 2, c: 2 }, extra = {}) => ({
  seed,
  shapes: Object.fromEntries(Object.entries(counts).map(([t, count]) => [
    t, { count, sizeMin: 1, sizeMax: 1, spread: 1, visible: true, ...extra }
  ]))
});
const gen = (config) => generateLayout({ config, palette, shapeDefs, view });

afterEach(() => vi.restoreAllMocks());

describe('generateLayout', () => {
  it('is deterministic: same inputs, identical layout', () => {
    expect(gen(cfg(1234))).toEqual(gen(cfg(1234)));
  });

  it('different seeds give different layouts', () => {
    expect(gen(cfg(1))).not.toEqual(gen(cfg(2)));
  });

  it('never touches Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random used'); });
    expect(() => gen(cfg(5))).not.toThrow();
  });

  it('produces plain JSON-safe data', () => {
    const layout = gen(cfg(8));
    expect(JSON.parse(JSON.stringify(layout))).toEqual(layout);
    layout.forEach((e) => {
      expect(e.position).toHaveLength(3);
      expect(e.rotation).toHaveLength(3);
      expect(e.scale).toHaveLength(3);
      expect(typeof e.hex).toBe('string');
    });
  });

  it('emits count entries per type, ordered by shape then index', () => {
    const layout = gen(cfg(3, { a: 2, b: 0, c: 3 }));
    expect(layout.map((e) => `${e.type}:${e.index}`)).toEqual(['a:0', 'a:1', 'c:0', 'c:1', 'c:2']);
  });

  it('draws colors from the palette', () => {
    gen(cfg(11, { a: 12, b: 12, c: 12 })).forEach((e) => expect(palette.accents).toContain(e.hex));
  });

  it('collision resolution runs over the whole set (low density resolves in nearly every case)', () => {
    // Deterministic (fixed seeds). The resolver caps attempts per shape, so at
    // HIGH density overlaps remain (a known limit, measured separately); at
    // one shape per type nearly every layout is fully separated.
    const overlapsIn = (layout) => {
      const boxes = layout.map((e) => {
        const shape = shapeDefs.find((s) => s.type === e.type);
        const q = shape.facesCamera
          ? view.billboard
          : new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation));
        return computeAABB(shape.localHalfExtents, new THREE.Vector3(...e.position), q, new THREE.Vector3(...e.scale));
      });
      let n = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) if (boxes[i].intersectsBox(boxes[j])) n++;
      }
      return n;
    };
    let clean = 0;
    for (let seed = 0; seed < 50; seed++) {
      if (overlapsIn(gen(cfg(seed, { a: 1, b: 1, c: 1 }))) === 0) clean++;
    }
    expect(clean).toBeGreaterThanOrEqual(45);
  });

  it('does not mutate its inputs', () => {
    const config = cfg(4);
    const snapshot = JSON.stringify(config);
    const q = view.billboard.clone();
    gen(config);
    expect(JSON.stringify(config)).toBe(snapshot);
    expect(view.billboard.equals(q)).toBe(true);
  });
});

describe('buildCandidate (per-instance streams)', () => {
  const settings = { sizeMin: 1, sizeMax: 1, spread: 1 };
  const build = (seed, type, index, s = settings) => buildCandidate({
    seed, shape: shapeDefs.find((x) => x.type === type), index, settings: s,
    accents: palette.accents, billboard: view.billboard
  });

  it('an instance does not depend on how many others exist', () => {
    // adding or removing instances must not perturb the others
    const a = build(7, 'a', 0);
    const again = build(7, 'a', 0);
    expect(a.position.toArray()).toEqual(again.position.toArray());
    expect(a.hex).toBe(again.hex);
    expect(gen(cfg(7, { a: 1, b: 0, c: 0 }))[0].hex).toBe(gen(cfg(7, { a: 5, b: 3, c: 2 }))[0].hex);
  });

  it('instances of the same type draw independently (never move in sync)', () => {
    expect(build(7, 'a', 0).position.toArray()).not.toEqual(build(7, 'a', 1).position.toArray());
  });

  it('keeps raw positions within the (spread-scaled) bounds', () => {
    for (let i = 0; i < 100; i++) {
      const p = build(i, 'a', 0).position;
      expect(Math.abs(p.x)).toBeLessThanOrEqual(BOUNDS.x);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(BOUNDS.y);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(BOUNDS.z);
    }
  });

  it('spread 0 pulls everything to the origin; spread 2 reaches past the edge', () => {
    const p0 = build(3, 'a', 0, { ...settings, spread: 0 }).position;
    expect(p0.length()).toBeCloseTo(0, 10);
    const reach = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(build(i, 'a', 0, { ...settings, spread: 2 }).position.x)));
    expect(reach).toBeGreaterThan(BOUNDS.x);
  });

  it('applies the size multiplier within [sizeMin, sizeMax]', () => {
    const base = build(5, 'a', 0, { ...settings, sizeMin: 1, sizeMax: 1 }).scale;
    const big = build(5, 'a', 0, { ...settings, sizeMin: 2, sizeMax: 2 }).scale;
    expect(big.x / base.x).toBeCloseTo(2, 6);
    for (let i = 0; i < 50; i++) {
      const s1 = build(i, 'a', 0, { ...settings, sizeMin: 1, sizeMax: 1 }).scale.x;
      const sr = build(i, 'a', 0, { ...settings, sizeMin: 0.5, sizeMax: 2 }).scale.x;
      expect(sr / s1).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(sr / s1).toBeLessThanOrEqual(2 + 1e-9);
    }
  });
});
