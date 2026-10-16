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
