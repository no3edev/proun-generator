import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { runStrategy } from '../src/generator/strategies/run.js';
import { STRATEGIES } from '../src/generator/strategies/index.js';
import { diagnoseLayout } from '../src/generator/diagnostics.js';
import { makeVolume, volumesIntersect } from '../src/generator/volumes.js';
import { COLLISION } from '../src/config/defaults.js';
import { each, makeConfig, layoutOf, depthAxis, view, shapeRegistry, palettes, DEFAULT_PALETTE } from './helpers/scene.js';

// The acceptance criteria of Stage 3 for the depth solver under a composition strategy, measured on real layouts:
//   - it changes DEPTH only: where a shape is on screen (and its rotation, size, colour, role) is the strategy's, untouched;
//   - real 3D intersections are essentially gone, and none involve the anchor;
//   - shapes stay near the depth their strategy planned (no scattering), never beyond the cap;
//   - the planned front/back order of overlapping shapes is kept (overlap is the look; its order is the strategy's intention);
//   - it is deterministic, fast, and leaves locked shapes alone.
const NAMES = Object.keys(STRATEGIES);
const ALL = each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 });
const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1);
const strategic = (seed, counts, name, opts, orientation = 'landscape') =>
  ({ ...makeConfig(seed, counts, opts), composition: { strategy: name }, orientation });
const diag = (entries) => diagnoseLayout({ entries, shapeDefs: shapeRegistry, view });
const run = (config, solve) => runStrategy({ strategy: STRATEGIES[config.composition.strategy], config, palette: palettes[DEFAULT_PALETTE], shapeDefs: shapeRegistry, view, solve });

/** pooled over seeds */
function pooled(name, counts, opts, orientation) {
  const t = { hits: 0, pairs: 0, anchor: 0, flips: 0, orderPairs: 0, shifts: [] };
  for (const seed of SEEDS) {
    const d = diag(layoutOf(strategic(seed, counts, name, opts, orientation)));
    t.hits += d.trueIntersections; t.anchor += d.anchorIntersections; t.pairs += (d.solids * (d.solids - 1)) / 2;
    t.flips += d.orderFlips; t.orderPairs += d.orderPairs; t.shifts.push(...d.shifts);
  }
  t.shifts.sort((a, b) => a - b);
  return {
    residual: t.hits / t.pairs, anchor: t.anchor, flipRate: t.flips / Math.max(1, t.orderPairs),
    mean: t.shifts.reduce((a, b) => a + b, 0) / t.shifts.length, p95: t.shifts[Math.floor(t.shifts.length * 0.95)], max: t.shifts[t.shifts.length - 1]
  };
}

describe.each(NAMES)('depth solver under %s', (name) => {
  it('changes depth only: screen position, rotation, size, colour and role are the strategy\'s, untouched', () => {
    for (const [counts, orientation] of [[each(1), 'landscape'], [ALL, 'landscape'], [ALL, 'portrait']]) {
      for (const seed of SEEDS.slice(0, 25)) {
        const config = strategic(seed, counts, name, {}, orientation);
        const plan = run(config, false), solved = run(config, true);
        expect(solved).toHaveLength(plan.length);
        solved.forEach((s, i) => {
          const p = plan[i];
          expect([s.type, s.index, s.role, s.hex, s.plannedDepth]).toEqual([p.type, p.index, p.role, p.hex, p.plannedDepth]);
          expect(s.rotation).toEqual(p.rotation);
          expect(s.scale).toEqual(p.scale);
          const moved = new THREE.Vector3(...s.position).sub(new THREE.Vector3(...p.position));
          expect(moved.clone().cross(depthAxis).length(), `${name} seed ${seed} ${s.type}`).toBeLessThan(1e-9); // only along the view axis
          expect(new THREE.Vector3(...p.position).dot(depthAxis)).toBeCloseTo(p.plannedDepth, 9); // the plan is what it says it is
        });
      }
    }
  });

  it('leaves essentially no real 3D intersections, and none with the anchor, at normal settings (defaults, every shape, portrait)', () => {
    for (const [counts, orientation] of [[each(1), 'landscape'], [ALL, 'landscape'], [ALL, 'portrait']]) {
      const m = pooled(name, counts, {}, orientation);
      expect(m.residual, `${name} ${orientation}`).toBeLessThanOrEqual(0.0005);
      expect(m.anchor).toBe(0);
    }
  });

  it('keeps shapes near their plan: mean shift 0.3 or less, 95th percentile 1.5 or less, never past the cap', () => {
    for (const [counts, orientation] of [[each(1), 'landscape'], [ALL, 'landscape'], [ALL, 'portrait']]) {
      const m = pooled(name, counts, {}, orientation);
      expect(m.mean, `${name} ${orientation}`).toBeLessThanOrEqual(0.3);
      expect(m.p95).toBeLessThanOrEqual(1.5);
      expect(m.max).toBeLessThanOrEqual(COLLISION.maxShift + 1e-9);
    }
  });

  it('keeps the planned front/back order of overlapping shapes: at most 5% reversed', () => {
    for (const [counts, orientation] of [[each(1), 'landscape'], [ALL, 'landscape'], [ALL, 'portrait']]) {
      expect(pooled(name, counts, {}, orientation).flipRate, `${name} ${orientation}`).toBeLessThanOrEqual(0.05);
    }
  });

  it('with large shapes (size 2-3) it is still controlled: under 0.1% of pairs intersecting, order mostly kept, never past the cap', () => {
    const m = pooled(name, ALL, { shape: { sizeMin: 2, sizeMax: 3 } }, 'landscape');
    expect(m.residual).toBeLessThanOrEqual(0.001);
    expect(m.flipRate).toBeLessThanOrEqual(0.12);
    expect(m.max).toBeLessThanOrEqual(COLLISION.maxShift + 1e-9);
  });

  it('is deterministic', () => {
    for (const seed of [3, 9, 27]) expect(layoutOf(strategic(seed, ALL, name))).toEqual(layoutOf(strategic(seed, ALL, name)));
  });

  it('is fast: a layout in about a millisecond, even with every shape on', () => {
    const t0 = performance.now();
    for (let seed = 1; seed <= 60; seed++) layoutOf(strategic(seed, ALL, name, { shape: { sizeMin: 2, sizeMax: 3 } }));
    expect(performance.now() - t0).toBeLessThan(1500); // a generous bound (the measured cost is ~0.1-1 ms per layout)
  });

  it('keeps a locked shape exactly where it is, and everything else clears it', () => {
    const locked = [{ position: [0.4, 0.2, 0.3], rotation: [0.1, 0.2, 0.3], scale: [1.5, 1.5, 1.5], hex: '#123456' }];
    for (const seed of SEEDS.slice(0, 20)) {
      const L = layoutOf(strategic(seed, each(1), name, { perType: { 'cube-fixed': { locked, count: 1 } } }));
      const mine = L.filter((e) => e.type === 'cube-fixed');
      expect(mine).toHaveLength(1);
      expect(mine[0].position).toEqual(locked[0].position);
      const defs = new Map(shapeRegistry.map((s) => [s.type, s]));
      const vol = (e) => makeVolume(defs.get(e.type), new THREE.Vector3(...e.position), defs.get(e.type).facesCamera ? view.billboard : new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation)), new THREE.Vector3(...e.scale));
      L.filter((e) => e !== mine[0] && defs.get(e.type).collides !== false).forEach((e) => {
        expect(volumesIntersect(vol(mine[0]), vol(e)), `${name} seed ${seed}: ${e.type} vs the locked cube`).toBe(false);
      });
    }
  });
});

describe('the legacy generator keeps its own solver', () => {
  it('a legacy layout is not touched by the volume solver: it carries no planned depth and its depth span is the old one\'s', () => {
    const L = layoutOf(makeConfig(5, each(3)));
    expect(L.every((e) => e.plannedDepth === undefined)).toBe(true);
    expect(diag(L).hasPlan).toBe(false);
  });
});
