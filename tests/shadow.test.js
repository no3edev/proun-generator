import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { SHADOW, hasShadow, shadowColor, shadowWorldOffset, shadowFor, shadowJitter, attachShadow, setShadowNow } from '../src/texture/shadow.js';
import { toneModeFor } from '../src/texture/tone.js';
import { disposeMesh } from '../src/texture/materials.js';
import { Tween } from '../src/core/Tween.js';
import { screenBasis } from '../src/generator/strategies/common.js';
import { CAMERA } from '../src/config/defaults.js';

const view = screenBasis(new THREE.Vector3(...CAMERA.position).normalize());
const palette = { paper: '#e9e4d8', ink: '#201d18' };
const half = { x: 0.75, y: 0.75, z: 0.02 };
const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const sat = (c) => { const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); return mx ? (mx - mn) / mx : 0; };
const seedWith = (strategy, pred) => { for (let s = 1; s < 5000; s++) if (pred(toneModeFor(s, strategy))) return s; throw new Error('no seed'); };
const cfg = (seed, strategy = 'axis-thrust') => ({ seed, composition: { strategy } });
const circle = (over = {}) => ({ type: 'triangle', role: 'anchor', hex: '#c1362b', rotation: [0, 0, 0], scale: [1.5, 1.5, 1], ...over });

describe('shadow colour', () => {
  it('is the parent colour toward the ink, desaturated, over the paper: darker than the paper and than a light parent, less saturated', () => {
    for (const hex of ['#c1362b', '#d8d3c4', '#8f8a7c']) {
      const c = shadowColor(hex, palette.paper, palette.ink);
      expect(luma(c)).toBeLessThan(luma(new THREE.Color(palette.paper)));
      expect(sat(c)).toBeLessThan(Math.max(sat(new THREE.Color(hex)), 0.2));
    }
    expect(luma(shadowColor('#d8d3c4', palette.paper, palette.ink))).toBeLessThan(luma(new THREE.Color('#d8d3c4')));
  });
});

describe('shadow offset', () => {
  it('is down-right on screen and behind, by a fraction of the size, within the clamp', () => {
    for (const s of [0.5, 1.2, 2.2]) {
      const w = shadowWorldOffset('circle', [s, s, 1], half, view);
      expect(w.dot(view.right)).toBeGreaterThan(0);
      expect(w.dot(view.up)).toBeLessThan(0);
      expect(w.dot(view.depth)).toBeCloseTo(-SHADOW.behind, 6);
      const screen = Math.hypot(w.dot(view.right), w.dot(view.up));
      expect(screen).toBeGreaterThanOrEqual(SHADOW.min - 1e-9);
      expect(screen).toBeLessThanOrEqual(SHADOW.max + 1e-9);
    }
    expect(SHADOW.behind).toBeLessThan(0.18); // under the solver's smallest gap
  });
  it('grows with the form, and a beam follows its thickness, not its length', () => {
    const small = shadowWorldOffset('circle', [0.6, 0.6, 1], half, view), big = shadowWorldOffset('circle', [2, 2, 1], half, view);
    expect(big.length()).toBeGreaterThan(small.length());
    const thin = shadowWorldOffset('beam', [5, 0.12, 0.1], { x: 0.5, y: 0.5, z: 0.5 }, view);
    const thick = shadowWorldOffset('beam', [2.6, 0.3, 0.3], { x: 0.5, y: 0.5, z: 0.5 }, view);
    expect(thick.length()).toBeGreaterThan(thin.length());
  });
});

describe('shadowFor', () => {
  const ctx = (config) => ({ half, config, palette, view });
  it('is null for the types that carry none', () => {
    for (const type of ['circle', 'cube-fixed', 'cube-variable', 'plane', 'rod', 'frame', 'ring', 'sphere']) {
      expect(hasShadow(type)).toBe(false);
      expect(shadowFor(circle({ type }), ctx(cfg(1)))).toBeNull();
    }
    for (const type of ['triangle', 'crescent', 'segment', 'beam']) expect(hasShadow(type)).toBe(true);
  });
  it('is off (tucked behind, no colour) under legacy, in pale scenes and for details', () => {
    const legacy = shadowFor(circle(), ctx({ seed: 3, composition: { strategy: 'legacy' } }));
    expect(legacy.local.lengthSq()).toBe(0); expect(legacy.color).toBeNull();
    const pale = shadowFor(circle(), ctx(cfg(seedWith('axis-thrust', (m) => m === 'pale'))));
    expect(pale.local.lengthSq()).toBe(0); expect(pale.color).toBeNull();
    const notPale = cfg(seedWith('axis-thrust', (m) => m !== 'pale'));
    expect(shadowFor(circle({ role: 'detail' }), ctx(notPale)).local.lengthSq()).toBe(0);
    expect(shadowFor(circle(), ctx(notPale)).local.lengthSq()).toBeGreaterThan(0);
    expect(shadowFor(circle(), ctx(notPale)).color).not.toBeNull();
  });
  it('puts the child, in the parent\'s own frame, exactly at the world offset (any orientation and size)', () => {
    const config = cfg(seedWith('disc-beams', (m) => m !== 'pale'), 'disc-beams');
    const e = { type: 'triangle', role: 'support', hex: '#3a3a38', rotation: [0.7, 1.9, -0.4], scale: [1.4, 0.8, 1.1] };
    const want = shadowFor(e, { ...ctx(config), half: { x: 0.5, y: 0.5, z: 0.1 } });
    const parent = new THREE.Object3D();
    parent.quaternion.setFromEuler(new THREE.Euler(...e.rotation)); parent.scale.set(...e.scale);
    const child = new THREE.Object3D(); child.position.copy(want.local); parent.add(child); parent.updateMatrixWorld(true);
    const w = shadowWorldOffset('triangle', e.scale, { x: 0.5, y: 0.5, z: 0.1 }, view, shadowJitter(config.seed, e));
    expect(child.getWorldPosition(new THREE.Vector3()).distanceTo(w)).toBeLessThan(1e-9);
  });
});

function shadowMesh() {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), new THREE.MeshBasicMaterial());
  mesh.userData.baseColor = new THREE.Color('#ff0000'); mesh.userData.applyShade = () => {};
  attachShadow(mesh);
  return mesh;
}
const tgt = (shadow) => ({ position: new THREE.Vector3(), rotation: { x: 0, y: 0, z: 0 }, scale: new THREE.Vector3(1, 1, 1), hex: '#ff0000', shadow });

describe('the shadow plane is a child that eases with its parent', () => {
  it('is hidden until wanted, then slides out from behind the parent, colour and all', () => {
    const mesh = shadowMesh(); const sh = mesh.userData.shadow.mesh;
    expect(sh.visible).toBe(false); expect(sh.parent).toBe(mesh); expect(sh.geometry).toBe(mesh.geometry);
    Tween.add(mesh, tgt({ local: new THREE.Vector3(0.1, -0.1, -0.05), color: new THREE.Color('#303030') }), 1000);
    expect(sh.visible).toBe(true);
    Tween.update(500);
    expect(sh.position.x).toBeGreaterThan(0); expect(sh.position.x).toBeLessThan(0.1);
    Tween.update(600);
    expect(sh.position.toArray()).toEqual([0.1, -0.1, -0.05]);
    expect(sh.material.color.getHexString()).toBe(new THREE.Color('#303030').getHexString());
    Tween.removeForMesh(mesh);
  });
  it('slides back behind its parent and is hidden again when no longer wanted, keeping its colour', () => {
    const mesh = shadowMesh(); const sh = mesh.userData.shadow.mesh;
    setShadowNow(mesh, { local: new THREE.Vector3(0.1, -0.1, -0.05), color: new THREE.Color('#303030') });
    expect(sh.visible).toBe(true);
    Tween.add(mesh, tgt({ local: new THREE.Vector3(), color: null }), 1000);
    Tween.update(500);
    expect(sh.visible).toBe(true);
    Tween.update(600);
    expect(sh.visible).toBe(false); expect(sh.position.lengthSq()).toBe(0);
    expect(sh.material.color.getHexString()).toBe(new THREE.Color('#303030').getHexString());
    Tween.removeForMesh(mesh);
  });
  it('a shadow that is tucked behind its parent at both ends is never drawn during the change (no white copy flickering over the shape)', () => {
    const mesh = shadowMesh(); const sh = mesh.userData.shadow.mesh;
    expect(sh.material.color.getHexString()).toBe('ffffff');   // the colour it has until it is given one
    Tween.add(mesh, tgt({ local: new THREE.Vector3(), color: null }), 1000);
    expect(sh.visible).toBe(false);
    for (const dt of [1, 100, 400, 400, 400]) { Tween.update(dt); expect(sh.visible).toBe(false); }
    Tween.removeForMesh(mesh);
  });
  it('a shadow that comes out from behind starts in the colour it will have, not in its default white', () => {
    const mesh = shadowMesh(); const sh = mesh.userData.shadow.mesh;
    Tween.add(mesh, tgt({ local: new THREE.Vector3(0.1, -0.1, -0.05), color: new THREE.Color('#303030') }), 1000);
    Tween.update(1);
    expect(sh.material.color.getHexString()).toBe(new THREE.Color('#303030').getHexString());
    Tween.update(500);
    expect(sh.material.color.getHexString()).toBe(new THREE.Color('#303030').getHexString());
    Tween.removeForMesh(mesh);
  });
  it('the shadow plane never wins a depth tie against its parent', () => {
    const sh = shadowMesh().userData.shadow.mesh;
    expect(sh.material.polygonOffset).toBe(true);
    expect(sh.material.polygonOffsetFactor).toBeGreaterThan(0);
  });
  it('an interrupting change starts from where the shadow is, not from its old end', () => {
    const mesh = shadowMesh(); const sh = mesh.userData.shadow.mesh;
    Tween.add(mesh, tgt({ local: new THREE.Vector3(0.2, 0, 0), color: new THREE.Color('#000000') }), 1000);
    Tween.update(500);
    const mid = sh.position.x;
    Tween.add(mesh, tgt({ local: new THREE.Vector3(0, 0, 0), color: null }), 1000);
    Tween.update(1);
    expect(Math.abs(sh.position.x - mid)).toBeLessThan(0.01);
    Tween.removeForMesh(mesh);
  });
  it('a mesh without a shadow plane (legacy, sphere, test doubles) ignores a shadow target', () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.userData.baseColor = new THREE.Color('#000'); m.userData.applyShade = () => {};
    expect(() => { Tween.add(m, tgt({ local: new THREE.Vector3(1, 1, 1), color: null }), 100); Tween.update(200); }).not.toThrow();
  });
  it('is disposed with its parent: its material goes, the shared geometry is the parent\'s to free once', () => {
    const mesh = shadowMesh(); const sh = mesh.userData.shadow.mesh;
    const matDispose = vi.spyOn(sh.material, 'dispose');
    disposeMesh(mesh);
    expect(matDispose).toHaveBeenCalledTimes(1);
    expect(sh.parent).toBeNull();
  });
});

describe('registration jitter (stage 5.3)', () => {
  const view = { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), depth: new THREE.Vector3(0, 0, 1) };
  const half = { x: 0.5, y: 0.5, z: 0.1 };
  const plain = shadowWorldOffset('triangle', [1.4, 0.8, 1.1], half, view);
  const planar = (v) => new THREE.Vector2(v.x, v.y);
  it('stays within the length and angle it is allowed, for every seed and form', () => {
    for (let seed = 0; seed < 200; seed++) {
      const j = shadowJitter(seed, { type: 'triangle', position: [seed * 0.13, -seed * 0.07, 0] });
      expect(Math.abs(j.length)).toBeLessThanOrEqual(SHADOW.jitterLength + 1e-12);
      expect(Math.abs(j.angle)).toBeLessThanOrEqual((SHADOW.jitterAngleDeg * Math.PI) / 180 + 1e-12);
      const w = shadowWorldOffset('triangle', [1.4, 0.8, 1.1], half, view, j);
      expect(planar(w).length() / planar(plain).length()).toBeCloseTo(1 + j.length, 6);
      expect(Math.abs(planar(w).angle() - planar(plain).angle())).toBeCloseTo(Math.abs(j.angle), 6);
      expect(w.z).toBe(plain.z);   // how far behind it lies is not jittered
    }
  });
  it('is the same every time for a scene and a form, and differs between forms', () => {
    const a = shadowJitter(7, { type: 'beam', position: [1, 2, 0] });
    expect(shadowJitter(7, { type: 'beam', position: [1, 2, 0] })).toEqual(a);
    expect(shadowJitter(7, { type: 'beam', position: [3, 2, 0] })).not.toEqual(a);
  });
  it('no jitter given means the plain offset (the old behaviour)', () => {
    expect(shadowWorldOffset('triangle', [1.4, 0.8, 1.1], half, view).equals(plain)).toBe(true);
  });
});
