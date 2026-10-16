import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeAABB, resolveCollisions, projectBoxOntoAxis, boxVolume } from '../src/generator/CollisionResolver.js';
import { COLLISION } from '../src/config/defaults.js';
import { depthAxis } from './helpers/scene.js';

const HALF = { x: 0.5, y: 0.5, z: 0.5 };
const ID = new THREE.Quaternion();
function cand(pos, scale = [1, 1, 1], extra = {}) {
  const position = new THREE.Vector3(...pos);
  const s = new THREE.Vector3(...scale);
  return { position, box: computeAABB(HALF, position, ID, s), ...extra };
}
const apart = (a, b) => {
  // separated along the depth axis by at least the margin (or at least not intersecting)
  const [aMin, aMax] = projectBoxOntoAxis(a.box, depthAxis);
  const [bMin, bMax] = projectBoxOntoAxis(b.box, depthAxis);
  return aMin >= bMax || bMin >= aMax;
};

describe('computeAABB', () => {
  it('is the box itself for an unrotated shape, scaled and moved', () => {
    const b = computeAABB(HALF, new THREE.Vector3(1, 2, 3), ID, new THREE.Vector3(2, 4, 6));
    expect(b.min.toArray()).toEqual([0, 0, 0]);
    expect(b.max.toArray()).toEqual([2, 4, 6]);
  });

  it('grows around a rotated shape (documented conservatism: a 45-degree square is wider than itself)', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 4));
    const b = computeAABB(HALF, new THREE.Vector3(), q, new THREE.Vector3(1, 1, 1));
    expect(b.max.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(boxVolume(b)).toBeGreaterThan(1);
  });
});

describe('resolveCollisions', () => {
  it('leaves candidates that do not intersect exactly where they are', () => {
    const a = cand([0, 0, 0]), b = cand([5, 0, 0]);
    resolveCollisions([a, b], depthAxis);
    expect(a.position.toArray()).toEqual([0, 0, 0]);
    expect(b.position.toArray()).toEqual([5, 0, 0]);
  });

  it('separates two overlapping shapes along the depth axis, and the larger one does not move', () => {
    const big = cand([0, 0, 0], [3, 3, 3]);
    const small = cand([0.2, 0, 0], [1, 1, 1]);
    resolveCollisions([small, big], depthAxis);
    expect(big.position.toArray()).toEqual([0, 0, 0]);
    expect(big.box.intersectsBox(small.box)).toBe(false);
    expect(apart(big, small)).toBe(true);
  });

  it('moves a shape only along the depth axis (its place on screen never changes) and keeps its box in step', () => {
    const a = cand([0, 0, 0], [2, 2, 2]);
    const b = cand([0.3, 0.2, 0.1]);
    const before = b.position.clone();
    resolveCollisions([a, b], depthAxis);
    const moved = b.position.clone().sub(before);
    expect(moved.length()).toBeGreaterThan(0);
    expect(moved.clone().cross(depthAxis).length()).toBeLessThan(1e-9);
    const fresh = computeAABB(HALF, b.position, ID, new THREE.Vector3(1, 1, 1));
    expect(b.box.min.distanceTo(fresh.min)).toBeLessThan(1e-9);
    expect(b.box.max.distanceTo(fresh.max)).toBeLessThan(1e-9);
  });

  it('leaves at least the margin between a resolved pair', () => {
    const a = cand([0, 0, 0], [2, 2, 2]);
    const b = cand([0, 0, 0]);
    resolveCollisions([a, b], depthAxis);
    const [aMin, aMax] = projectBoxOntoAxis(a.box, depthAxis);
    const [bMin, bMax] = projectBoxOntoAxis(b.box, depthAxis);
    const gap = Math.max(bMin - aMax, aMin - bMax);
    expect(gap).toBeGreaterThanOrEqual(COLLISION.margin - 1e-9);
  });

  it('never moves a fixed (locked) candidate: others are placed around it', () => {
    const fixed = cand([0, 0, 0], [1, 1, 1], { fixed: true });
    const big = cand([0, 0, 0], [4, 4, 4]);
    resolveCollisions([big, fixed], depthAxis);
    expect(fixed.position.toArray()).toEqual([0, 0, 0]);
    expect(big.position.length()).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const make = () => [cand([0, 0, 0], [2, 2, 2]), cand([0.5, 0.2, 0]), cand([-0.3, 0.1, 0.2], [1.5, 1, 1])];
    const a = make(), b = make();
    resolveCollisions(a, depthAxis);
    resolveCollisions(b, depthAxis);
    a.forEach((c, i) => expect(c.position.toArray()).toEqual(b[i].position.toArray()));
  });

  it('gives up after COLLISION.maxIterations per shape (known limit: Stage 3 target)', () => {
    // never throws or loops forever, whatever the crowd
    const crowd = Array.from({ length: 12 }, (_, i) => cand([i * 0.01, 0, 0], [2, 2, 2]));
    expect(() => resolveCollisions(crowd, depthAxis)).not.toThrow();
  });

  it.todo('Stage 3: no residual 3D intersection under normal settings (today ~5-6% of box pairs at 3 each; see tools/diagnose.mjs)');
});
