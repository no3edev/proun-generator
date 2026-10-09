import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeAABB, resolveCollisions, boxVolume } from '../src/generator/CollisionResolver.js';

const HALF = { x: 0.5, y: 0.5, z: 0.5 };
const IDENTITY = new THREE.Quaternion();
// roughly the app's camera-forward direction (normalized)
const DEPTH = new THREE.Vector3(4.2, 3.4, 5.2).normalize();

function candidate(pos, scale = 1) {
  const position = new THREE.Vector3(...pos);
  const s = new THREE.Vector3(scale, scale, scale);
  return { position, scale: s, box: computeAABB(HALF, position, IDENTITY, s) };
}

describe('computeAABB', () => {
  it('scales local half extents', () => {
    const b = computeAABB(HALF, new THREE.Vector3(1, 2, 3), IDENTITY, new THREE.Vector3(2, 4, 6));
    expect(b.min.toArray()).toEqual([0, 0, 0]);
    expect(b.max.toArray()).toEqual([2, 4, 6]);
  });
  it('grows to enclose a rotated box', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);
    const b = computeAABB(HALF, new THREE.Vector3(), q, new THREE.Vector3(1, 1, 1));
    expect(b.max.x).toBeCloseTo(Math.SQRT1_2, 5);
  });
});

describe('boxVolume', () => {
  it('is zero for an empty/inverted box', () => {
    expect(boxVolume(new THREE.Box3())).toBe(0);
  });
});

describe('resolveCollisions', () => {
  it('leaves non-overlapping shapes where they are', () => {
    const a = candidate([-3, 0, 0]);
    const b = candidate([3, 0, 0]);
    resolveCollisions([a, b], DEPTH);
    expect(a.position.toArray()).toEqual([-3, 0, 0]);
    expect(b.position.toArray()).toEqual([3, 0, 0]);
  });

  it('separates identical, fully overlapping shapes', () => {
    const items = [candidate([0, 0, 0]), candidate([0, 0, 0]), candidate([0, 0, 0])];
    resolveCollisions(items, DEPTH);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        expect(items[i].box.intersectsBox(items[j].box)).toBe(false);
      }
    }
  });

  it('keeps each candidate\'s box in sync with its moved position', () => {
    const items = [candidate([0, 0, 0], 1.5), candidate([0.1, 0, 0], 1)];
    resolveCollisions(items, DEPTH);
    for (const c of items) {
      const fresh = computeAABB(HALF, c.position, IDENTITY, c.scale);
      expect(c.box.min.distanceTo(fresh.min)).toBeLessThan(1e-6);
      expect(c.box.max.distanceTo(fresh.max)).toBeLessThan(1e-6);
    }
  });

  it('only moves shapes along the depth axis', () => {
    const a = candidate([0, 0, 0], 1.5);
    const b = candidate([0.2, 0.1, 0], 1);
    const before = b.position.clone();
    resolveCollisions([a, b], DEPTH);
    const delta = b.position.clone().sub(before);
    // delta must be parallel to DEPTH (cross product ~ 0)
    expect(delta.clone().cross(DEPTH).length()).toBeLessThan(1e-6);
  });
});
