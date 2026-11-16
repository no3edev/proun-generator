import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { diagnoseLayout } from '../src/generator/diagnostics.js';
import { runStrategy } from '../src/generator/strategies/run.js';
import { STRATEGIES } from '../src/generator/strategies/index.js';
import { CAMERA } from '../src/config/defaults.js';
import { each, makeConfig, layoutOf, depthAxis, view, shapeRegistry, palettes, DEFAULT_PALETTE } from './helpers/scene.js';

const diag = (entries) => diagnoseLayout({ entries, shapeDefs: shapeRegistry, view });
let n = 0;
/** a layout entry at a screen-neutral spot: `at` is the depth along the view axis, `off` an offset in the screen plane */
const at = (type, depth, { off = [0, 0], scale = [1, 1, 1], role, planned, rotation = [0, 0, 0] } = {}) => {
  const right = new THREE.Vector3(0, 1, 0).cross(depthAxis).normalize();
  const up = depthAxis.clone().cross(right).normalize();
  const p = depthAxis.clone().multiplyScalar(depth).addScaledVector(right, off[0]).addScaledVector(up, off[1]);
  return { type, index: n++, position: p.toArray(), rotation, scale, hex: '#808080', ...(role ? { role } : {}), ...(planned !== undefined ? { plannedDepth: planned } : {}) };
};

describe('diagnoseLayout: counts', () => {
  it('an empty layout has nothing to report', () => {
    const d = diag([]);
    expect(d).toMatchObject({ shapes: 0, solids: 0, trueIntersections: 0, projectedOverlaps: 0, hasPlan: false, depthSpan: 0, outsideCamera: 0 });
  });

  it('counts real intersections, and only real ones', () => {
    expect(diag([at('cube-fixed', 0), at('cube-fixed', 0.5)]).trueIntersections).toBe(1);        // overlapping along the view axis
    expect(diag([at('cube-fixed', 0), at('cube-fixed', 3)]).trueIntersections).toBe(0);          // clear of each other
    expect(diag([at('cube-fixed', 0), at('cube-fixed', 0.5, { off: [0.2, 0] }), at('cube-fixed', 9)]).trueIntersections).toBe(1);
  });

  it('a shape that crosses others on purpose (a rod, a frame, a ring) is not an intersection, but still overlaps on screen', () => {
    const d = diag([at('cube-fixed', 0), at('rod', 0, { scale: [0.1, 4, 0.1] }), at('frame', 0, { scale: [3, 3, 1] })]);
    expect(d.solids).toBe(1);
    expect(d.trueIntersections).toBe(0);
    expect(d.projectedOverlaps).toBeGreaterThanOrEqual(2);
  });

  it('counts the intersections that involve the anchor', () => {
    const d = diag([at('cube-fixed', 0, { role: 'anchor' }), at('cube-fixed', 0.4, { role: 'support' }), at('cube-fixed', 5, { role: 'support' }), at('cube-fixed', 5.4, { role: 'support' })]);
    expect(d.trueIntersections).toBe(2);
    expect(d.anchorIntersections).toBe(1);
  });

  it('a sphere is tested as a ball: it clears a box that its own bounding box would not', () => {
    // a unit ball (radius 0.68) near the corner of a box: the corners are farther than the radius, the bounding boxes overlap
    const d = diag([at('sphere', 0, { off: [0, 0] }), at('cube-fixed', 0, { off: [1.1, 1.1] })]);
    expect(d.trueIntersections).toBe(0);
    expect(d.projectedOverlaps).toBe(1);
  });

  it('silhouettes that only graze are not an overlap; shapes far apart on screen are not', () => {
    expect(diag([at('cube-fixed', 0), at('cube-fixed', 0, { off: [5, 0] })]).projectedOverlaps).toBe(0);
  });

  it('depth span and the camera\'s range', () => {
    const d = diag([at('cube-fixed', -3), at('cube-fixed', 4)]);
    expect(d.depthSpan).toBeCloseTo(7, 9);
    expect(d.outsideCamera).toBe(0);
    const cameraDistance = new THREE.Vector3(...CAMERA.position).length();
    expect(diag([at('cube-fixed', cameraDistance - CAMERA.near + 1)]).outsideCamera).toBe(1);
    expect(diag([at('cube-fixed', cameraDistance - CAMERA.far - 1)]).outsideCamera).toBe(1);
  });
});

describe('diagnoseLayout: against the plan', () => {
  it('without planned depths (the legacy generator) there is no plan to compare with', () => {
    const d = diag([at('cube-fixed', 0), at('cube-fixed', 5)]);
    expect(d.hasPlan).toBe(false);
    expect(d.orderPairs).toBe(0);
    expect(d.shifts).toEqual([]);
    expect(d.meanShift).toBe(0);
  });

  it('shifts: how far each solid is from its planned depth; shapes that never move are left out', () => {
    const d = diag([at('cube-fixed', 2, { planned: 0 }), at('cube-variable', -1, { planned: 0.5 }), at('rod', 7, { planned: 7, scale: [0.1, 4, 0.1] })]);
    expect(d.hasPlan).toBe(true);
    expect(d.shifts.map((x) => +x.toFixed(9)).sort()).toEqual([1.5, 2]);
    expect(d.meanShift).toBeCloseTo(1.75, 9);
    expect(d.maxShift).toBeCloseTo(2, 9);
  });

  it('counts the overlapping pairs the plan ordered, and those the solver put the other way round', () => {
    // two shapes on top of each other on screen: planned a in front (3) of b (0)
    const kept = diag([at('cube-fixed', 4, { planned: 3 }), at('cube-fixed', 0.5, { planned: 0 })]);
    expect(kept.orderPairs).toBe(1);
    expect(kept.orderFlips).toBe(0);
    const flipped = diag([at('cube-fixed', -4, { planned: 3 }), at('cube-fixed', 0.5, { planned: 0 })]);
    expect(flipped.orderPairs).toBe(1);
    expect(flipped.orderFlips).toBe(1);
  });

  it('a pair the plan did not order (equal planned depth), or that does not overlap on screen, is not counted', () => {
    expect(diag([at('cube-fixed', 0, { planned: 1 }), at('cube-fixed', 3, { planned: 1 })]).orderPairs).toBe(0);
    expect(diag([at('cube-fixed', 0, { planned: 0 }), at('cube-fixed', 3, { planned: 3, off: [6, 0] })]).orderPairs).toBe(0);
  });
});

describe('diagnoseLayout: on real layouts', () => {
  const ALL = each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 });
  const strategic_layout = (seed, counts, strategy) => layoutOf({ ...makeConfig(seed, counts), composition: { strategy }, orientation: 'landscape' });
  const strategic = (seed, counts, strategy) => ({ ...makeConfig(seed, counts), composition: { strategy }, orientation: 'landscape' });
  const STRATEGIES_NAMES = ['axis-thrust', 'disc-beams', 'central-cluster'];

  it('the legacy generator has no plan; every strategy shape carries its planned depth', () => {
    expect(diag(layoutOf(makeConfig(3, each(2)))).hasPlan).toBe(false);
    for (const s of STRATEGIES_NAMES) strategic_layout(3, ALL, s).forEach((e) => expect(typeof e.plannedDepth, `${s} ${e.type}`).toBe('number'));
  });

  it('shapes the solver never moves (rod, frame, ring) are exactly at their planned depth', () => {
    for (const s of STRATEGIES_NAMES) {
      for (let seed = 1; seed <= 20; seed++) {
        strategic_layout(seed, ALL, s).filter((e) => ['rod', 'frame', 'ring'].includes(e.type)).forEach((e) => {
          expect(new THREE.Vector3(...e.position).dot(depthAxis)).toBeCloseTo(e.plannedDepth, 9);
        });
      }
    }
  });

  it('the invariants hold for every strategy: pairs <= overlaps, flips <= pairs, one shift per solid, nothing outside the camera', () => {
    for (const s of STRATEGIES_NAMES) {
      for (let seed = 1; seed <= 30; seed++) {
        const d = diag(strategic_layout(seed, ALL, s));
        expect(d.hasPlan).toBe(true);
        expect(d.orderPairs).toBeLessThanOrEqual(d.projectedOverlaps);
        expect(d.orderFlips).toBeLessThanOrEqual(d.orderPairs);
        expect(d.shifts).toHaveLength(d.solids);
        expect(d.maxShift).toBeGreaterThanOrEqual(d.meanShift);
        expect(d.anchorIntersections).toBeLessThanOrEqual(d.trueIntersections);
        expect(d.outsideCamera).toBe(0);
        expect(d.projectedOverlaps).toBeGreaterThan(0); // overlap is the look: a composition without any would be wrong
      }
    }
  });

  it('agrees with an independent oracle (three\'s OBB) on the real intersections of strategy layouts made of boxes, solved or not', () => {
    // solved layouts have (almost) no intersections left, so the plans as drawn (before the depth solver) are compared as well:
    // that is where the intersections are, and what keeps this comparison from being vacuous
    const boxes = { 'cube-fixed': 1, 'cube-variable': 1, plane: 1, beam: 1 };
    const obb = (e) => {
      const he = shapeRegistry.find((s) => s.type === e.type).localHalfExtents;
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation)));
      return new OBB(new THREE.Vector3(...e.position), new THREE.Vector3(he.x * e.scale[0], he.y * e.scale[1], he.z * e.scale[2]), new THREE.Matrix3().setFromMatrix4(m));
    };
    const plan = (seed, s) => runStrategy({ strategy: STRATEGIES[s], config: strategic(seed, boxes, s), palette: palettes[DEFAULT_PALETTE], shapeDefs: shapeRegistry, view, solve: false });
    let compared = 0;
    for (const s of STRATEGIES_NAMES) {
      for (let seed = 1; seed <= 25; seed++) {
        for (const L of [strategic_layout(seed, boxes, s), plan(seed, s)]) {
          let oracle = 0;
          for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (obb(L[i]).intersectsOBB(obb(L[j]))) oracle++;
          expect(diag(L).trueIntersections, `${s} seed ${seed}`).toBe(oracle);
          compared += oracle;
        }
      }
    }
    expect(compared).toBeGreaterThan(20); // the comparison was not vacuous
  });
});
