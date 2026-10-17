import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { screenBasis, splitPalette, hexToHsl } from '../src/generator/strategies/common.js';
import { STRATEGY_NAMES, STRATEGY_LABELS } from '../src/generator/strategies/index.js';
import { CAMERA } from '../src/config/defaults.js';
import { each, makeConfig, layoutOf, depthAxis, cameraPosition, palettes, shapeRegistry } from './helpers/scene.js';

const basis = screenBasis(depthAxis);
const ccCfg = (seed, counts = each(1), opts, extra = {}) =>
  ({ ...makeConfig(seed, counts, opts), composition: { strategy: 'central-cluster' }, orientation: 'landscape', ...extra });
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const without = (counts, ...types) => ({ ...counts, ...Object.fromEntries(types.map((t) => [t, 0])) });
const everything = each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 });
const FRAME = { halfH: CAMERA.frustumSize / 2, halfW: (CAMERA.frustumSize / 2) * (720 / 560) };

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const screenOf = (e) => { const p = new THREE.Vector3(...e.position); return [p.dot(basis.right), p.dot(basis.up)]; };
const he = (e) => shapeRegistry.find((s) => s.type === e.type).localHalfExtents;
/** a world-aligned box's size on screen (its projected bounding box) */
const footprint = (e) => {
  const [sx, sy, sz] = [2 * he(e).x * e.scale[0], 2 * he(e).y * e.scale[1], 2 * he(e).z * e.scale[2]];
  return {
    w: sx * Math.abs(X.dot(basis.right)) + sy * Math.abs(Y.dot(basis.right)) + sz * Math.abs(Z.dot(basis.right)),
    h: sx * Math.abs(X.dot(basis.up)) + sy * Math.abs(Y.dot(basis.up)) + sz * Math.abs(Z.dot(basis.up))
  };
};
const isBox = (e) => ['cube-fixed', 'cube-variable', 'plane', 'beam', 'rod'].includes(e.type);
const SOLID_ROLES = ['anchor', 'support', 'connector'];
const projAngle = (e, axisVec) => {
  const v = axisVec.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation)));
  let a = (Math.atan2(v.dot(basis.up), v.dot(basis.right)) * 180) / Math.PI;
  while (a > 90) a -= 180;
  while (a <= -90) a += 180;
  return a;
};
/** the share of the frame covered by the bounding boxes of the boxy entries (an upper bound on the ink) */
function coverage(L) {
  const N = 120, M = 90; let hit = 0;
  const boxes = L.filter(isBox).map((e) => { const [x, y] = screenOf(e); const f = footprint(e); return { x0: x - f.w / 2, x1: x + f.w / 2, y0: y - f.h / 2, y1: y + f.h / 2 }; });
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const x = -FRAME.halfW + ((i + 0.5) / N) * 2 * FRAME.halfW, y = -FRAME.halfH + ((j + 0.5) / M) * 2 * FRAME.halfH;
    if (boxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1)) hit++;
  }
  return hit / (N * M);
}

describe('central cluster: selection and reproducibility', () => {
  it('is a selectable strategy, last in the list', () => {
    expect(STRATEGY_NAMES).toContain('central-cluster');
    expect(STRATEGY_LABELS['central-cluster']).toBe('Central cluster');
    expect(STRATEGY_NAMES[STRATEGY_NAMES.length - 1]).toBe('central-cluster');
  });

  it('same seed -> same composition; different seed -> different; independent of `visible`; unlike the other strategies', () => {
    expect(layoutOf(ccCfg(5))).toEqual(layoutOf(ccCfg(5)));
    expect(layoutOf(ccCfg(5))).not.toEqual(layoutOf(ccCfg(6)));
    expect(layoutOf(ccCfg(5, each(1), { shape: { visible: false } }))).toEqual(layoutOf(ccCfg(5)));
    ['axis-thrust', 'disc-beams'].forEach((s) => expect(layoutOf(ccCfg(7))).not.toEqual(layoutOf({ ...ccCfg(7), composition: { strategy: s } })));
  });

  it('owns the counts: 6-16 shapes; a type at 0 never appears; all 0 is empty', () => {
    SEEDS.forEach((seed) => {
      const n = layoutOf(ccCfg(seed)).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(16);
      layoutOf(ccCfg(seed, without(each(1), 'cube-fixed', 'triangle'))).forEach((e) => expect(['cube-fixed', 'triangle']).not.toContain(e.type));
    });
    expect(layoutOf(ccCfg(1, each(0)))).toEqual([]);
  });

  it('still composes with few types, and indexes stay contiguous per type in registry order', () => {
    expect(layoutOf(ccCfg(2, { 'cube-variable': 1 })).length).toBeGreaterThan(0);
    expect(layoutOf(ccCfg(2, { circle: 1 })).length).toBeGreaterThan(0);
    SEEDS.slice(0, 15).forEach((seed) => {
      const L = layoutOf(ccCfg(seed, everything));
      const seen = {};
      L.forEach((e) => { expect(e.index).toBe(seen[e.type] || 0); seen[e.type] = e.index + 1; });
      const order = L.map((e) => shapeRegistry.findIndex((s) => s.type === e.type));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
  });
});

describe('central cluster: structure', () => {
  it('has one anchor, the main block, in the upper middle of the frame', () => {
    SEEDS.forEach((seed) => {
      const anchors = layoutOf(ccCfg(seed)).filter((e) => e.role === 'anchor');
      expect(anchors).toHaveLength(1);
      expect(isBox(anchors[0])).toBe(true);
      const [x, y] = screenOf(anchors[0]);
      expect(Math.abs(x)).toBeLessThanOrEqual(0.18 * FRAME.halfW + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(0.3 * FRAME.halfH + 1e-6);
    });
  });

  it('every solid is world-aligned, all with the same orientation (one axonometric view for the whole cluster)', () => {
    SEEDS.forEach((seed) => layoutOf(ccCfg(seed)).filter((e) => isBox(e) && e.role !== 'detail').forEach((e) => {
      e.rotation.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-9));
    }));
  });

  it('has a tall bar that stands exactly upright on screen, taller than the main block', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(ccCfg(seed));
      const bars = L.filter((e) => e.role === 'connector');
      expect(bars).toHaveLength(1);
      expect(Math.abs(Math.abs(projAngle(bars[0], Y)) - 90)).toBeLessThan(1e-6);
      const main = L.find((e) => e.role === 'anchor');
      expect(footprint(bars[0]).h).toBeGreaterThan(footprint(main).h * 0.8);
    });
  });

  it('keeps the cluster compact: the plate, slab and bar are all within reach of the main block', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(ccCfg(seed));
      const [ax, ay] = screenOf(L.find((e) => e.role === 'anchor'));
      const near = L.filter((e) => e.role === 'connector' || (e.role === 'support' && screenOf(e)[1] > -0.5 * FRAME.halfH));
      expect(near.length).toBeGreaterThanOrEqual(3); // plate, slab, bar
      near.forEach((e) => {
        const [x, y] = screenOf(e);
        expect(Math.hypot(x - ax, y - ay)).toBeLessThan(0.55 * CAMERA.frustumSize);
      });
    });
  });

  it('keeps the plate inside the frame, as the references\' plates are', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(ccCfg(seed));
      const plate = L.filter((e) => e.role === 'support' && screenOf(e)[1] > -0.5 * FRAME.halfH)
        .sort((a, b) => b.scale[0] - a.scale[0])[0];
      const [, y] = screenOf(plate);
      expect(y + footprint(plate).h / 2).toBeLessThanOrEqual(FRAME.halfH * 0.97 + 1e-6);
    });
  });

  it('puts a small second cluster against the bottom edge, and the hairline on the other side', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(ccCfg(seed, each(1, { rod: 1 })));
      const edge = L.filter((e) => e.role === 'support' && screenOf(e)[1] <= -0.5 * FRAME.halfH);
      expect(edge, `seed ${seed}`).toHaveLength(2);
      const side = Math.sign(screenOf(edge[0])[0]);
      expect(Math.abs(screenOf(edge[0])[0])).toBeGreaterThanOrEqual(0.3 * FRAME.halfW);
      const hairline = L.filter((e) => e.type === 'rod').sort((a, b) => b.scale[1] - a.scale[1])[0];
      expect(Math.sign(screenOf(hairline)[0])).toBe(-side);
      expect(Math.abs(screenOf(hairline)[0])).toBeGreaterThanOrEqual(0.75 * FRAME.halfW);
    });
  });

  it('is mostly ground: the boxes\' bounding boxes cover under 55% of the frame in every scene, under 40% on average', () => {
    const cov = SEEDS.map((seed) => coverage(layoutOf(ccCfg(seed, everything))));
    expect(Math.max(...cov)).toBeLessThan(0.55);
    expect(cov.reduce((a, b) => a + b, 0) / cov.length).toBeLessThan(0.4);
  });

  it('every accent is far smaller than the main block; every entry has a role', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(ccCfg(seed, everything));
      const main = L.find((e) => e.role === 'anchor');
      const ext = (e) => Math.max(2 * he(e).x * e.scale[0], 2 * he(e).y * e.scale[1]);
      L.forEach((e) => expect(['anchor', 'support', 'connector', 'accent', 'detail']).toContain(e.role));
      L.filter((e) => e.role === 'accent').forEach((a) => expect(ext(a)).toBeLessThan(ext(main)));
    });
  });
});

describe('central cluster: outlines, colour and options', () => {
  it('a frame, when enabled, is a diamond: its long side at 45 degrees on screen, centred on the cluster', () => {
    let seen = 0;
    SEEDS.forEach((seed) => {
      const L = layoutOf(ccCfg(seed, everything));
      const main = L.find((e) => e.role === 'anchor');
      L.filter((e) => e.type === 'frame').forEach((f) => {
        seen++;
        expect(Math.abs(Math.abs(projAngle(f, X)) - 45)).toBeLessThan(1e-6);
        screenOf(f).forEach((v, i) => expect(v).toBeCloseTo(screenOf(main)[i], 9));
      });
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('never more than one saturated hue, on any shipped palette; only palette colours', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const { saturated } = splitPalette(palette);
      SEEDS.slice(0, 15).forEach((seed) => {
        const L = layoutOf(ccCfg(seed, everything), name);
        const hues = new Set(L.map((e) => e.hex).filter((h) => hexToHsl(h).s >= 0.5));
        expect(hues.size, `${name} ${seed}`).toBeLessThanOrEqual(1);
        hues.forEach((h) => expect(saturated).toContain(h));
        L.forEach((e) => expect([...palette.accents, palette.ink]).toContain(e.hex));
      });
    }
  });

  it('the main block, plate and slab are three different colours, so the cluster reads', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(ccCfg(seed));
      const solids = L.filter((e) => e.role === 'anchor' || (e.role === 'support' && screenOf(e)[1] > -0.5 * FRAME.halfH));
      expect(solids.length).toBeGreaterThanOrEqual(3);
      const main = L.find((e) => e.role === 'anchor');
      solids.filter((e) => e !== main).forEach((e) => expect(e.hex, `seed ${seed}`).not.toBe(main.hex));
    });
  });

  it('snapRotation changes nothing (nothing is turned) and a locked type is replayed verbatim', () => {
    expect(layoutOf(ccCfg(9, each(1), { shape: { snapRotation: true } }))).toEqual(layoutOf(ccCfg(9)));
    const locked = [{ position: [0.5, 0.5, 0.5], rotation: [0.1, 0.2, 0.3], scale: [1, 1, 1], hex: '#123456' }];
    const L = layoutOf(ccCfg(8, each(1), { perType: { 'cube-fixed': { locked, count: 1 } } }));
    const cubes = L.filter((e) => e.type === 'cube-fixed');
    expect(cubes).toHaveLength(1);
    expect(cubes[0].position).toEqual(locked[0].position);
    expect(cubes[0].role).toBeUndefined();
  });

  it('composes in every orientation and never leaves a shape outside the clip planes at the UI limits', () => {
    ['portrait', 'square', 'landscape'].forEach((o) => expect(layoutOf(ccCfg(3, each(1), {}, { orientation: o })).length).toBeGreaterThan(0));
    const dist = cameraPosition.length();
    SEEDS.slice(0, 10).forEach((seed) => {
      layoutOf(ccCfg(seed, each(12, { rod: 12 }), { shape: { sizeMin: 10, sizeMax: 10 } })).forEach((e) => {
        const d = new THREE.Vector3(...e.position).dot(depthAxis);
        expect(d).toBeLessThan(dist - CAMERA.near);
        expect(d).toBeGreaterThan(dist - CAMERA.far);
      });
    });
  });

  it('every entry is well-formed', () => {
    SEEDS.forEach((seed) => layoutOf(ccCfg(seed, everything)).forEach((e) => {
      [...e.position, ...e.rotation, ...e.scale].forEach((v) => expect(Number.isFinite(v)).toBe(true));
      e.scale.forEach((v) => expect(v).toBeGreaterThan(0));
      expect(e.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }));
  });
});
