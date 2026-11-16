import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Tween } from '../src/core/Tween.js';
import { Rhythm } from '../src/core/Rhythm.js';

// A mesh with the minimum the classic (non-front) colour path needs.
function mesh() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  m.userData.baseColor = new THREE.Color('#000000');
  m.userData.applyShade = () => {};
  return m;
}
const target = (x) => ({ position: new THREE.Vector3(x, 0, 0), rotation: { x: 0, y: 0, z: 0 }, scale: new THREE.Vector3(1, 1, 1), hex: '#ffffff' });

describe('Tween pause and scrub', () => {
  beforeEach(() => Rhythm.reset());

  it('scrubs the last change back and forth after it has finished', () => {
    const m = mesh();
    Tween.add(m, target(10), 1000);
    Tween.update(1200);                       // finished
    expect(m.position.x).toBe(10);
    Rhythm.setHold(0.5, 1000);
    Tween.update(16);
    expect(m.position.x).toBeCloseTo(5, 6);   // half way (the easing is symmetric)
    Rhythm.setHold(0.0005, 1000);
    Tween.update(16);
    expect(m.position.x).toBeLessThan(0.01);  // back at the start
    Rhythm.setHold(1.7, 1000);
    Tween.update(16);
    expect(m.position.x).toBe(10);            // past 1: the end, exactly
    Rhythm.setHold(null, 1000);
    Tween.update(16);
    expect(m.position.x).toBe(10);
  });

  it('releasing mid-way lets the change carry on from there to its exact end', () => {
    const m = mesh();
    Tween.add(m, target(10), 1000);
    Tween.update(1200);
    Rhythm.setHold(0.5, 1000);
    Tween.update(16);
    Rhythm.setHold(null, 1000);
    Tween.update(100);
    expect(m.position.x).toBeGreaterThan(5);
    expect(m.position.x).toBeLessThan(10);
    Tween.update(2000);
    expect(m.position.x).toBe(10);
  });

  it('a mesh removed for good is no longer scrubbed', () => {
    const m = mesh();
    Tween.add(m, target(10), 1000);
    Tween.update(1200);
    Tween.removeForMesh(m);
    m.position.set(99, 0, 0);
    Rhythm.setHold(0.5, 1000);
    Tween.update(16);
    expect(m.position.x).toBe(99);
    Rhythm.setHold(null, 1000);
  });

  it('a new change replaces the old one for that mesh', () => {
    const m = mesh();
    Tween.add(m, target(10), 1000);
    Tween.update(1200);
    Tween.add(m, target(30), 1000);
    Tween.update(1200);
    Rhythm.setHold(0.5, 1000);
    Tween.update(16);
    expect(m.position.x).toBeCloseTo(20, 6);  // between 10 and 30, not between 0 and 10
    Rhythm.setHold(null, 1000);
  });
});

describe('Tween onComplete', () => {
  beforeEach(() => Rhythm.reset());

  it('is called once, when the tween reaches its end, and not before', () => {
    const m = mesh();
    let calls = 0;
    Tween.add(m, target(10), 1000, () => { calls++; });
    Tween.update(400);
    expect(calls).toBe(0);
    Tween.update(700);
    expect(calls).toBe(1);
    expect(m.position.x).toBe(10);
    Tween.update(500);
    expect(calls).toBe(1);
  });

  it('is not called when another tween takes over the mesh, or when the mesh is removed', () => {
    const a = mesh(), b = mesh();
    let calls = 0;
    Tween.add(a, target(10), 1000, () => { calls++; });
    Tween.update(300);
    Tween.add(a, target(20), 1000);          // takes over: the first one is canceled, not completed
    Tween.update(2000);
    Tween.add(b, target(10), 1000, () => { calls++; });
    Tween.removeForMesh(b);
    Tween.update(2000);
    expect(calls).toBe(0);
  });

  it('is not called while the lab\'s pause holds the change, and is called once it is released and runs out', () => {
    const m = mesh();
    let calls = 0;
    Tween.add(m, target(10), 1000, () => { calls++; });
    Rhythm.setHold(0.5, 1000);
    Tween.update(16);
    Tween.update(5000);
    expect(calls).toBe(0);
    Rhythm.setHold(null, 1000);
    Tween.update(16);
    Tween.update(1500);
    expect(calls).toBe(1);
    expect(m.position.x).toBe(10);
  });

  it('a mesh that shrinks away ends at its tiny scale, ready to be disposed by the callback', () => {
    const m = mesh();
    const done = [];
    Tween.add(m, { position: m.position.clone(), rotation: { x: 0, y: 0, z: 0 }, scale: new THREE.Vector3(0.001, 0.001, 0.001), hex: '#000000' }, 500, () => done.push(m.scale.x));
    Tween.update(600);
    expect(done).toEqual([0.001]);
  });
});

describe('Tween.finishWithin: a shorter way for what is already on its way', () => {
  beforeEach(() => Rhythm.reset());

  it('does not move the mesh when it is called, then lands exactly on the target after the new time, completing once', () => {
    const m = mesh();
    const done = [];
    Tween.add(m, target(10), 60_000, () => done.push(1));
    Tween.update(15_000);
    const x = m.position.x;
    expect(Tween.finishWithin(m, 1000)).toBe(true);
    Tween.update(0);
    expect(m.position.x).toBeCloseTo(x, 9);          // same place: no jump, no restart of the easing
    Tween.update(999);
    expect(m.position.x).toBeLessThan(10);
    expect(done).toEqual([]);
    Tween.update(2);
    expect(m.position.x).toBe(10);
    expect(done).toEqual([1]);
  });

  it('is a no-op when less than the new time is left, when nothing runs, and for a time that makes no sense', () => {
    const m = mesh();
    Tween.add(m, target(10), 1000);
    Tween.update(900);
    expect(Tween.finishWithin(m, 500)).toBe(false);  // 100 ms left already
    Tween.update(99);
    expect(m.position.x).toBeLessThan(10);
    Tween.update(2);
    expect(m.position.x).toBe(10);
    expect(Tween.finishWithin(m, 500)).toBe(false);  // finished: nothing to shorten
    expect(Tween.finishWithin(mesh(), 500)).toBe(false);
    const n = mesh();
    Tween.add(n, target(5), 60_000);
    for (const bad of [0, -1, NaN]) expect(Tween.finishWithin(n, bad)).toBe(false);
  });
});
