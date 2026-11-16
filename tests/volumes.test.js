import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { makeVolume, volumesIntersect, volumeScreenBox, screenBoxesOverlap } from '../src/generator/volumes.js';
import { screenBasis } from '../src/generator/strategies/common.js';
import { depthAxis } from './helpers/scene.js';

const BOX = { localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 } };
const SPHERE = { localHalfExtents: { x: 0.68, y: 0.68, z: 0.68 }, volumeKind: 'sphere' };
const ID = new THREE.Quaternion();
const box = (pos, scale = [1, 1, 1], q = ID) => makeVolume(BOX, new THREE.Vector3(...pos), q, new THREE.Vector3(...scale));
const ball = (pos, s = 1) => makeVolume(SPHERE, new THREE.Vector3(...pos), ID, new THREE.Vector3(s, s, s));
const turn = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

describe('makeVolume', () => {
  it('is a box of the shape\'s half extents, scaled and turned', () => {
    const v = box([1, 2, 3], [2, 4, 6], turn(0, Math.PI / 2, 0));
    expect(v.kind).toBe('box');
    expect(v.half).toEqual([1, 2, 3]);
    expect(v.center.toArray()).toEqual([1, 2, 3]);
    expect(v.axes[0].distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-9);
  });
  it('is a ball of the largest half extent for a sphere shape', () => {
    const v = ball([0, 0, 0], 2);
    expect(v.kind).toBe('sphere');
    expect(v.radius).toBeCloseTo(1.36, 9); // 0.68 scaled by 2
  });
});

describe('volumesIntersect: boxes', () => {
  it('separated, overlapping, contained, and (conservatively) touching boxes', () => {
    expect(volumesIntersect(box([0, 0, 0]), box([3, 0, 0]))).toBe(false);
    expect(volumesIntersect(box([0, 0, 0]), box([0.9, 0, 0]))).toBe(true);
    expect(volumesIntersect(box([0, 0, 0], [4, 4, 4]), box([0.2, 0, 0], [0.5, 0.5, 0.5]))).toBe(true);
    expect(volumesIntersect(box([0, 0, 0]), box([1, 0, 0]))).toBe(true); // touching face to face counts
  });

  it('margin: a gap smaller than the margin counts as intersecting', () => {
    const a = box([0, 0, 0]), b = box([1.1, 0, 0]); // a 0.1 gap
    expect(volumesIntersect(a, b, 0)).toBe(false);
    expect(volumesIntersect(a, b, 0.18)).toBe(true);
    expect(volumesIntersect(a, b, 0.05)).toBe(false);
  });

  it('sees that a long rotated beam passes beside a box that its world-axis box would swallow', () => {
    // a 6-long thin beam turned 45 degrees about z, with a cube off to one side of the diagonal
    const beam = box([0, 0, 0], [6, 0.2, 0.2], turn(0, 0, Math.PI / 4));
    const aside = box([2.2, -2.2, 0], [0.8, 0.8, 0.8]);
    expect(volumesIntersect(beam, aside)).toBe(false);
    const across = box([2.2, 2.2, 0], [0.8, 0.8, 0.8]);
    expect(volumesIntersect(beam, across)).toBe(true);
  });

  it('crossing beams intersect when they cross, and not when one is lifted clear', () => {
    const a = box([0, 0, 0], [6, 0.3, 0.3]);
    expect(volumesIntersect(a, box([0, 0, 0], [0.3, 6, 0.3]))).toBe(true);
    expect(volumesIntersect(a, box([0, 0, 1], [0.3, 6, 0.3]))).toBe(false);
  });

  it('agrees with three\'s own OBB test on thousands of random pairs (an independent oracle)', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const mkOBB = (v) => new OBB(v.center.clone(), new THREE.Vector3(...v.half), new THREE.Matrix3().set(
      v.axes[0].x, v.axes[1].x, v.axes[2].x, v.axes[0].y, v.axes[1].y, v.axes[2].y, v.axes[0].z, v.axes[1].z, v.axes[2].z));
    let mismatches = 0, hits = 0, N = 6000;
    for (let i = 0; i < N; i++) {
      const mk = () => box([(rnd() - 0.5) * 6, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6], [0.1 + rnd() * 5, 0.1 + rnd() * 2, 0.1 + rnd() * 2], turn(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3));
      const a = mk(), b = mk();
      const ours = volumesIntersect(a, b), theirs = mkOBB(a).intersectsOBB(mkOBB(b));
      if (theirs) hits++;
      if (ours !== theirs) mismatches++;
    }
    expect(hits).toBeGreaterThan(N * 0.1);   // the sample has plenty of intersecting and of separate pairs
    expect(hits).toBeLessThan(N * 0.9);
    expect(mismatches).toBe(0);
  });
});

describe('volumesIntersect: balls', () => {
  // a unit ball has radius 0.68
  it('ball-ball, with and without a margin', () => {
    expect(volumesIntersect(ball([0, 0, 0]), ball([1.4, 0, 0]))).toBe(false);
    expect(volumesIntersect(ball([0, 0, 0]), ball([1.3, 0, 0]))).toBe(true);
    expect(volumesIntersect(ball([0, 0, 0]), ball([1.45, 0, 0]), 0.2)).toBe(true);
    expect(volumesIntersect(ball([0, 0, 0]), ball([1.45, 0, 0]), 0.05)).toBe(false);
  });
  it('ball-box: face, corner, a ball inside a box, and symmetry', () => {
    expect(volumesIntersect(ball([0, 0, 0]), box([1.0, 0, 0]))).toBe(true);        // the box face is 0.5 away, under the radius
    expect(volumesIntersect(ball([0, 0, 0]), box([2.0, 0, 0]))).toBe(false);
    expect(volumesIntersect(ball([0, 0, 0]), box([1.1, 1.1, 1.1]))).toBe(false);   // near the corner: 1.04 away
    expect(volumesIntersect(ball([0, 0, 0]), box([0.8, 0.8, 0.8]))).toBe(true);    // its corner is 0.52 away
    expect(volumesIntersect(ball([0, 0, 0], 0.2), box([0, 0, 0], [4, 4, 4]))).toBe(true);
    expect(volumesIntersect(box([2.0, 0, 0]), ball([0, 0, 0]))).toBe(false);
    expect(volumesIntersect(box([1.0, 0, 0]), ball([0, 0, 0]))).toBe(true);
  });
});

describe('screen boxes', () => {
  const basis = screenBasis(depthAxis);
  it('are the exact projected extent: equal to projecting all eight corners', () => {
    for (const q of [ID, turn(0.3, 0.9, 1.7), turn(2, 0.1, 0.5)]) {
      const v = box([1, -0.5, 2], [2, 0.5, 3], q);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const p = v.center.clone().addScaledVector(v.axes[0], sx * v.half[0]).addScaledVector(v.axes[1], sy * v.half[1]).addScaledVector(v.axes[2], sz * v.half[2]);
        x0 = Math.min(x0, p.dot(basis.right)); x1 = Math.max(x1, p.dot(basis.right)); y0 = Math.min(y0, p.dot(basis.up)); y1 = Math.max(y1, p.dot(basis.up));
      }
      const b = volumeScreenBox(v, basis);
      expect([b.x0, b.x1, b.y0, b.y1].map((n) => +n.toFixed(9))).toEqual([x0, x1, y0, y1].map((n) => +n.toFixed(9)));
    }
  });
  it('a ball\'s is its diameter square, and overlap is decided by more than a hair', () => {
    const b = volumeScreenBox(ball([0, 0, 0]), basis);
    expect(b.x1 - b.x0).toBeCloseTo(0.68 * 2, 9);
    expect(screenBoxesOverlap({ x0: 0, x1: 1, y0: 0, y1: 1 }, { x0: 0.5, x1: 2, y0: 0.5, y1: 2 })).toBe(true);
    expect(screenBoxesOverlap({ x0: 0, x1: 1, y0: 0, y1: 1 }, { x0: 0.98, x1: 2, y0: 0, y1: 1 })).toBe(false);
    expect(screenBoxesOverlap({ x0: 0, x1: 1, y0: 0, y1: 1 }, { x0: 3, x1: 4, y0: 0, y1: 1 })).toBe(false);
  });
});
