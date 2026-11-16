import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveVolumes } from '../src/generator/strategies/volumeSolver.js';
import { makeVolume, volumesIntersect } from '../src/generator/volumes.js';
import { COLLISION } from '../src/config/defaults.js';
import { depthAxis, billboard } from './helpers/scene.js';

const BOX = { type: 'box', localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 } };
const BALL = { type: 'ball', localHalfExtents: { x: 0.68, y: 0.68, z: 0.68 }, volumeKind: 'sphere' };
const NOCOLLIDE = { ...BOX, type: 'rod', collides: false };
let order = 0;
/**
 * A solver item. Its volume's local z lies along the view axis (the camera-facing orientation), so `size` is [across, across,
 * depth]; `depth` is where it starts along the view axis; `screen` an offset in the picture plane.
 */
function item({ shape = BOX, size = [1, 1, 1], depth = 0, screen = [0, 0], role, planned, fixed = false } = {}) {
  const right = new THREE.Vector3(0, 1, 0).cross(depthAxis).normalize();
  const up = depthAxis.clone().cross(right).normalize();
  const position = depthAxis.clone().multiplyScalar(depth).addScaledVector(right, screen[0]).addScaledVector(up, screen[1]);
  return { shape, q: billboard.clone(), scale: new THREE.Vector3(...size), position, fixed, collides: shape.collides !== false, role, planned: planned ?? depth, order: order++ };
}
const depthOf = (it) => it.position.dot(depthAxis);
const vol = (it) => makeVolume(it.shape, it.position, it.q, it.scale);
const clear = (a, b, margin = COLLISION.margin) => !volumesIntersect(vol(a), vol(b), margin - 1e-6);
const screenPart = (v) => v.clone().addScaledVector(depthAxis, -v.dot(depthAxis));

describe('resolveVolumes: the basics', () => {
  it('leaves shapes that are clear of each other exactly where they are', () => {
    const a = item({ depth: 0, role: 'anchor' }), b = item({ depth: 5, role: 'support' });
    const before = [a.position.clone(), b.position.clone()];
    expect(resolveVolumes([a, b], depthAxis)).toEqual({ unresolved: 0 });
    expect(a.position).toEqual(before[0]);
    expect(b.position).toEqual(before[1]);
  });

  it('never moves the anchor for a lower-priority shape; the other shape yields, along the view axis only', () => {
    const anchor = item({ size: [3, 3, 0.4], depth: 0, role: 'anchor' }), beam = item({ size: [4, 0.3, 0.3], depth: 0.1, role: 'support' });
    const a0 = anchor.position.clone(), b0 = beam.position.clone();
    const r = resolveVolumes([beam, anchor], depthAxis); // given in the "wrong" order: priority decides, not list order
    expect(r.unresolved).toBe(0);
    expect(anchor.position).toEqual(a0);
    expect(beam.position.distanceTo(b0)).toBeGreaterThan(0);
    expect(screenPart(beam.position).distanceTo(screenPart(b0))).toBeLessThan(1e-9); // where it is on screen did not change
    expect(clear(anchor, beam)).toBe(true);
  });

  it('slides the smallest distance that clears (with the margin), not further', () => {
    // two thin plates facing the camera, 0.1 apart in depth: the second needs to move exactly enough to leave `margin` between them
    const a = item({ size: [2, 2, 0.2], depth: 0, role: 'anchor' }), b = item({ size: [2, 2, 0.2], depth: 0.1, role: 'support' });
    resolveVolumes([a, b], depthAxis);
    expect(depthOf(b) - depthOf(a)).toBeCloseTo(0.2 + COLLISION.margin, 3); // half-thicknesses 0.1 + 0.1, plus the margin
  });

  it('works on balls, and on a ball against a box', () => {
    const a = item({ shape: BALL, size: [2, 2, 2], depth: 0, role: 'anchor' }), b = item({ size: [1, 1, 1], depth: 0.2, role: 'support' });
    resolveVolumes([a, b], depthAxis);
    expect(clear(a, b)).toBe(true);
    const c = item({ shape: BALL, size: [1, 1, 1], depth: 0, screen: [0.3, 0], role: 'accent' });
    resolveVolumes([a, b, c], depthAxis);
    expect(clear(a, c)).toBe(true);
    expect(clear(b, c)).toBe(true);
  });

  it('ignores a shape that does not collide (a rod, a frame): it neither moves nor blocks', () => {
    const a = item({ size: [3, 3, 1], depth: 0, role: 'anchor' }), rod = item({ shape: NOCOLLIDE, size: [0.1, 4, 0.1], depth: 0, role: 'detail' });
    const rod0 = rod.position.clone();
    resolveVolumes([a, rod], depthAxis);
    expect(rod.position).toEqual(rod0);
    const b = item({ size: [1, 1, 1], depth: 0.3, role: 'support' }); // and nothing is stopped from sharing the rod's place
    resolveVolumes([a, b, rod], depthAxis);
    expect(clear(a, b)).toBe(true);
  });

  it('a fixed (locked) shape is immovable: whatever it hits yields, even an anchor', () => {
    const locked = item({ size: [2, 2, 0.5], depth: 0, fixed: true }), anchor = item({ size: [2, 2, 0.5], depth: 0.1, role: 'anchor' });
    const l0 = locked.position.clone();
    resolveVolumes([anchor, locked], depthAxis);
    expect(locked.position).toEqual(l0);
    expect(clear(locked, anchor)).toBe(true);
  });
});

describe('resolveVolumes: keeping the planned order', () => {
  // `h` is a thick block spanning depth -1..5; `c` starts at depth 0, near h's back: down costs little, up costs a lot
  const make = (planned) => ({ h: item({ size: [4, 4, 6], depth: 2, role: 'anchor', planned: -1 }), c: item({ size: [1, 1, 0.4], depth: 0, role: 'support', planned }) });

  it('goes to its planned side (in front) when that costs no more than the slack extra', () => {
    const { h, c } = make(0);
    resolveVolumes([h, c], depthAxis, { orderSlack: 10 });
    expect(depthOf(c)).toBeGreaterThan(depthOf(h)); // planned in front of h: ends in front, though it is the long way round
  });

  it('with the default slack, a small extra cost is paid to stay on the planned side, a large one is not', () => {
    // h spans depth -1..5 (see make): keeping order costs ~3.5 more than the near side, which is past the default slack of 3
    const { h, c } = make(0);
    resolveVolumes([h, c], depthAxis);
    expect(depthOf(c)).toBeLessThan(depthOf(h));
    // a thinner block: staying in front costs only ~1.5 extra, within the slack
    const h2 = item({ size: [4, 4, 3], depth: 0.9, role: 'anchor', planned: -1 }), c2 = item({ size: [1, 1, 0.4], depth: 0, role: 'support', planned: 0 });
    resolveVolumes([h2, c2], depthAxis);
    expect(COLLISION.orderSlack).toBe(3); // the approved slack
    expect(depthOf(c2)).toBeGreaterThan(depthOf(h2));
  });

  it('takes the nearer side when keeping the order would cost more than the slack', () => {
    const { h, c } = make(0);
    resolveVolumes([h, c], depthAxis, { orderSlack: 0.5 });
    expect(depthOf(c)).toBeLessThan(depthOf(h));
  });

  it('planned behind: goes behind', () => {
    const h = item({ size: [4, 4, 6], depth: 2, role: 'anchor', planned: 1 }), c = item({ size: [1, 1, 0.4], depth: 0, role: 'support', planned: 0 });
    resolveVolumes([h, c], depthAxis, { orderSlack: 10 });
    expect(depthOf(c)).toBeLessThan(depthOf(h));
  });
});

describe('resolveVolumes: no going back and forth between shapes', () => {
  it('a thin shape across two plates sandwiched close together still ends clear of both (a monotone sweep, not a ping-pong)', () => {
    // plates 0.3 apart: clearing one by the nearest way puts a hairline inside the other
    const a = item({ size: [4, 4, 0.3], depth: 0, role: 'anchor' }), b = item({ size: [4, 4, 0.3], depth: 0.6, role: 'support' });
    const hair = item({ size: [4, 0.05, 0.05], depth: 0.3, role: 'detail', planned: 0.3 });
    const r = resolveVolumes([a, b, hair], depthAxis);
    expect(r.unresolved).toBe(0);
    expect(clear(hair, a)).toBe(true);
    expect(clear(hair, b)).toBe(true);
    expect(clear(a, b)).toBe(true);
  });

  it('a pile of identical shapes at one spot is fanned out, none ever left intersecting, within the shift cap', () => {
    const pile = Array.from({ length: 6 }, (_, i) => item({ size: [2, 2, 0.5], depth: 0, role: i === 0 ? 'anchor' : 'support' }));
    const r = resolveVolumes(pile, depthAxis);
    expect(r.unresolved).toBe(0);
    for (let i = 0; i < pile.length; i++) for (let j = i + 1; j < pile.length; j++) expect(clear(pile[i], pile[j])).toBe(true);
    pile.forEach((p) => expect(Math.abs(depthOf(p))).toBeLessThanOrEqual(COLLISION.maxShift + 1e-9));
  });
});

describe('resolveVolumes: the shift cap and what it reports', () => {
  it('never slides a shape farther than maxShift from where it started; what it cannot clear it reports as unresolved', () => {
    const pile = Array.from({ length: 8 }, () => item({ size: [2, 2, 1], depth: 0, role: 'support' }));
    const r = resolveVolumes(pile, depthAxis, { maxShift: 1.5 });
    pile.forEach((p) => expect(Math.abs(depthOf(p))).toBeLessThanOrEqual(1.5 + 1e-9));
    expect(r.unresolved).toBeGreaterThan(0);
  });
});

describe('resolveVolumes: the default cap', () => {
  it('with the default settings, a pile too big to fan out within the cap is held to it, and the rest is reported', () => {
    // 40 plates of depth 1 at one spot would need about +-20 units: far past the default maxShift
    const pile = Array.from({ length: 40 }, (_, i) => item({ size: [2, 2, 1], depth: 0, role: i === 0 ? 'anchor' : 'support' }));
    const r = resolveVolumes(pile, depthAxis);
    pile.forEach((p) => expect(Math.abs(depthOf(p))).toBeLessThanOrEqual(COLLISION.maxShift + 1e-9));
    expect(Math.max(...pile.map((p) => Math.abs(depthOf(p))))).toBeGreaterThan(COLLISION.maxShift - 1.5); // it did use the room it had
    expect(r.unresolved).toBeGreaterThan(0);
    expect(COLLISION.maxShift).toBe(6); // the approved cap
  });
});

describe('resolveVolumes: determinism and order', () => {
  const scene = () => [
    item({ size: [3, 3, 0.4], depth: 0, role: 'anchor' }), item({ size: [5, 0.3, 0.3], depth: 0.1, role: 'support' }),
    item({ size: [5, 0.3, 0.3], depth: 0.2, role: 'support' }), item({ size: [1, 1, 0.3], depth: 0.1, role: 'accent', screen: [0.5, 0.2] }),
    item({ size: [4, 0.05, 0.05], depth: 0.15, role: 'detail' })
  ];
  const run = (items) => { resolveVolumes(items, depthAxis); return items.map((it) => depthOf(it)); };

  it('gives the same result every time', () => {
    order = 0; const a = run(scene()); order = 0; const b = run(scene());
    expect(a).toEqual(b);
  });

  it('does not depend on the order the items are listed in (priority and size decide, then the original order)', () => {
    order = 0; const base = scene(); const byOrder = [...base].sort((x, y) => x.order - y.order);
    const forward = run([...base]).map((d, i) => [base[i].order, d]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    order = 0; const again = scene();
    const shuffled = [again[3], again[0], again[4], again[2], again[1]];
    resolveVolumes(shuffled, depthAxis);
    const result = [...again].sort((x, y) => x.order - y.order).map((it) => depthOf(it));
    expect(result).toEqual(forward);
    expect(byOrder.length).toBe(5);
  });
});
