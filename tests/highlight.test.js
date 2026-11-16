import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HIGHLIGHT, hasHighlight, highlightDirection, pickHighlights, updateHighlight, setHighlightNow } from '../src/texture/highlight.js';
import { toneModeFor } from '../src/texture/tone.js';
import { Tween } from '../src/core/Tween.js';
import { screenBasis } from '../src/generator/strategies/common.js';
import { CAMERA } from '../src/config/defaults.js';

const view = screenBasis(new THREE.Vector3(...CAMERA.position).normalize());
const HALF = { x: 0.5, y: 0.5, z: 0.1 };
const halfOf = () => HALF;
const seedWith = (strategy, pred) => { for (let s = 1; s < 5000; s++) if (pred(toneModeFor(s, strategy))) return s; throw new Error('no seed'); };
const cfg = (seed, strategy = 'axis-thrust') => ({ seed, composition: { strategy } });
const e = (type, role, s) => ({ type, role, scale: [s, s, 1] });

describe('highlight direction', () => {
  it('is up-left on screen, opposite the shadow plane', () => {
    const d = highlightDirection(view);
    expect(d.dot(view.right)).toBeLessThan(0);
    expect(d.dot(view.up)).toBeGreaterThan(0);
    expect(d.dot(view.depth)).toBeCloseTo(0, 9);
    expect(d.length()).toBeCloseTo(1, 9);
  });
});

describe('pickHighlights', () => {
  const entries = [
    e('segment', 'anchor', 1), e('triangle', 'support', 3), e('beam', 'support', 1), e('crescent', 'accent', 2),
    e('segment', 'connector', 0.5), e('triangle', 'detail', 5), e('cube-variable', 'support', 6), e('rod', 'detail', 9), e('circle', 'support', 12)
  ];
  const calm = cfg(seedWith('axis-thrust', (m) => m !== 'pale'));
  it('picks nothing under legacy and in pale scenes', () => {
    expect(pickHighlights(entries, { config: { seed: 3, composition: { strategy: 'legacy' } }, halfOf }).size).toBe(0);
    expect(pickHighlights(entries, { config: cfg(seedWith('axis-thrust', (m) => m === 'pale')), halfOf }).size).toBe(0);
  });
  it('picks the anchor and the largest one or two others, never a detail or an ineligible type', () => {
    const picked = pickHighlights(entries, { config: calm, halfOf });
    expect(picked.has(entries[0])).toBe(true);
    expect(picked.size).toBeGreaterThanOrEqual(2);
    expect(picked.size).toBeLessThanOrEqual(3);
    expect(picked.has(entries[1])).toBe(true); // the triangle (area 3) is the largest of the others
    for (const p of picked) { expect(hasHighlight(p.type)).toBe(true); expect(p.role).not.toBe('detail'); }
    expect(picked.has(entries[6])).toBe(false);
    expect(picked.has(entries[8])).toBe(false); // a circle has no volume: it takes no highlight, however large
    expect(hasHighlight('circle')).toBe(false);
  });
  it('is deterministic, and takes a seeded one or two others', () => {
    expect([...pickHighlights(entries, { config: calm, halfOf })]).toEqual([...pickHighlights(entries, { config: calm, halfOf })]);
    const sizes = new Set();
    for (let s = 1; s < 400; s++) if (toneModeFor(s, 'axis-thrust') !== 'pale') sizes.add(pickHighlights(entries, { config: cfg(s), halfOf }).size);
    expect([...sizes].sort()).toEqual([2, 3]);
  });
  it('works without an anchor and with few forms', () => {
    const few = [e('triangle', 'support', 1)];
    expect(pickHighlights(few, { config: calm, halfOf }).size).toBe(1);
    expect(pickHighlights([], { config: calm, halfOf }).size).toBe(0);
  });
});

function litMesh() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.userData.baseColor = new THREE.Color('#808080'); mesh.userData.applyShade = () => {};
  mesh.userData.front = {
    uFront: { value: 1 }, uFrontA: { value: 1 }, uFrom: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
    uHiAmt: { value: 0 }, uHiN: { value: new THREE.Vector3() }, uHiBand: { value: new THREE.Vector2() }, uHiTint: { value: new THREE.Color() }, hiDir: new THREE.Vector3()
  };
  return mesh;
}

describe('the strip is computed from the form\'s current orientation and scale', () => {
  it('a dot with uHiN is the world distance along the direction, for any rotation and size; the edge is the farthest vertex', () => {
    const dir = highlightDirection(view);
    for (const [rot, sc] of [[[0, 0, 0], [1, 1, 1]], [[0.7, 1.9, -0.4], [1.4, 0.8, 1.1]], [[2.1, -0.3, 0.9], [4, 0.15, 0.2]]]) {
      const mesh = litMesh();
      mesh.quaternion.setFromEuler(new THREE.Euler(...rot)); mesh.scale.set(...sc); mesh.updateMatrixWorld(true);
      setHighlightNow(mesh, { on: true, dir, tint: new THREE.Color('#ffffff') });
      const f = mesh.userData.front;
      let far = -Infinity;
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        const world = v.clone().applyMatrix4(mesh.matrixWorld).sub(mesh.position);
        expect(v.dot(f.uHiN.value)).toBeCloseTo(world.dot(dir), 6);
        far = Math.max(far, world.dot(dir));
      }
      expect(f.uHiBand.value.x).toBeCloseTo(far, 6);
      expect(f.uHiBand.value.y).toBeGreaterThanOrEqual(HIGHLIGHT.minWidth - 1e-9);
      expect(f.uHiBand.value.y).toBeLessThanOrEqual(HIGHLIGHT.maxWidth + 1e-9);
      expect(f.uHiAmt.value).toBe(1);
    }
  });
  it('is a no-op for a mesh without highlight state', () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    expect(() => { updateHighlight(m); setHighlightNow(m, { on: true, dir: new THREE.Vector3(), tint: new THREE.Color() }); }).not.toThrow();
  });
});

const tgt = (highlight, over = {}) => ({ position: new THREE.Vector3(), rotation: { x: 0, y: 0, z: 0 }, scale: new THREE.Vector3(1, 1, 1), hex: '#808080', highlight, ...over });
describe('the highlight fades with the geometry\'s easing', () => {
  const want = (on) => ({ on, dir: highlightDirection(view), tint: new THREE.Color('#e9e4d8') });
  it('fades in from nothing and out again, ending exactly on 1 and 0', () => {
    const mesh = litMesh(); const f = mesh.userData.front;
    Tween.add(mesh, tgt(want(true)), 1000);
    Tween.update(500);
    expect(f.uHiAmt.value).toBeGreaterThan(0); expect(f.uHiAmt.value).toBeLessThan(1);
    Tween.update(600);
    expect(f.uHiAmt.value).toBe(1);
    Tween.add(mesh, tgt(want(false)), 1000);
    Tween.update(1100);
    expect(f.uHiAmt.value).toBe(0);
    Tween.removeForMesh(mesh);
  });
  it('an interrupting change fades from where it is', () => {
    const mesh = litMesh(); const f = mesh.userData.front;
    Tween.add(mesh, tgt(want(true)), 1000); Tween.update(500);
    const mid = f.uHiAmt.value;
    Tween.add(mesh, tgt(want(false)), 1000); Tween.update(1);
    expect(Math.abs(f.uHiAmt.value - mid)).toBeLessThan(0.02);
    Tween.removeForMesh(mesh);
  });
  it('the strip follows a form as it turns', () => {
    const mesh = litMesh(); const f = mesh.userData.front;
    Tween.add(mesh, tgt(want(true), { rotation: { x: 0, y: 0, z: 0 } }), 10); Tween.update(20);
    const before = f.uHiN.value.clone();
    Tween.add(mesh, tgt(want(true), { rotation: { x: 0.9, y: 0.5, z: 0.2 } }), 1000); Tween.update(500);
    expect(f.uHiN.value.distanceTo(before)).toBeGreaterThan(0.01);
    Tween.removeForMesh(mesh);
  });
  it('a mesh without highlight state ignores a highlight target', () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.userData.baseColor = new THREE.Color('#000'); m.userData.applyShade = () => {};
    expect(() => { Tween.add(m, tgt(want(true)), 100); Tween.update(200); }).not.toThrow();
  });
});
