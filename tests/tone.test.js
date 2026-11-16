import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TONE_MODES, DARK_FLOOR, LIFT_CAP, DISPLAY, MODE_MIX, linearOf, toneModeFor, faceRoles, faceShades, hasBoxTone } from '../src/texture/tone.js';
import { setShade, shiftShade, settleShade } from '../src/texture/materials.js';
import { Tween } from '../src/core/Tween.js';
import { screenBasis } from '../src/generator/strategies/common.js';
import { CAMERA } from '../src/config/defaults.js';

const view = screenBasis(new THREE.Vector3(...CAMERA.position).normalize());
const ratio = (m) => m[0] / m[2];

describe('tone profiles', () => {
  it('have the stated light : dark ratios (faceted about 3:1, subtle about 1.2:1, pale about 1.1:1)', () => {
    expect(ratio(DISPLAY.faceted)).toBeGreaterThan(2.9);
    expect(ratio(DISPLAY.faceted)).toBeLessThan(3.1);
    expect(ratio(DISPLAY.subtle)).toBeGreaterThan(1.15);
    expect(ratio(DISPLAY.subtle)).toBeLessThan(1.3);
    expect(ratio(DISPLAY.pale)).toBeLessThan(1.15);
    for (const mode of TONE_MODES) {
      const [l, m, d] = DISPLAY[mode];
      expect(l).toBeGreaterThan(m);
      expect(m).toBeGreaterThan(d);
    }
    expect(linearOf(1)).toBe(1);
  });
});

describe('toneModeFor', () => {
  it('is null for the legacy generator and for unknown strategies, and deterministic otherwise', () => {
    expect(toneModeFor(5, 'legacy')).toBeNull();
    expect(toneModeFor(5, 'nonsense')).toBeNull();
    expect(toneModeFor(12345, 'axis-thrust')).toBe(toneModeFor(12345, 'axis-thrust'));
  });
  it('follows each strategy\'s mix, and the mixes average 40 / 45 / 15', () => {
    const N = 6000, total = { faceted: 0, subtle: 0, pale: 0 };
    for (const strategy of Object.keys(MODE_MIX)) {
      const c = { faceted: 0, subtle: 0, pale: 0 };
      for (let seed = 1; seed <= N; seed++) c[toneModeFor(seed * 7919, strategy)]++;
      for (const mode of TONE_MODES) {
        expect(Math.abs(c[mode] / N - MODE_MIX[strategy][mode])).toBeLessThan(0.03);
        total[mode] += c[mode] / (N * 3);
      }
    }
    expect(Math.abs(total.faceted - 0.4)).toBeLessThan(0.02);
    expect(Math.abs(total.subtle - 0.45)).toBeLessThan(0.02);
    expect(Math.abs(total.pale - 0.15)).toBeLessThan(0.02);
  });
});

describe('face roles', () => {
  it('an unrotated box shows three faces: the top is light, the left one dark, the other mid', () => {
    const roles = faceRoles(new THREE.Quaternion(), view);
    expect(roles[2]).toBe(0); // +y turned up
    expect(roles.filter((r) => r === 0).length).toBe(1);
    expect(roles.filter((r) => r === 2).length).toBe(1);
    // of +x and +z (the two side faces visible) the one turned further left is dark
    const left = (i) => [[1, 0, 0], [0, 0, 1]].map((a) => new THREE.Vector3(...a).dot(view.right))[i];
    expect(roles[left(0) < left(1) ? 0 : 4]).toBe(2);
  });
  it('every orientation has exactly one light face and, once two faces show, exactly one dark face', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 800; k++) {
      const q = new THREE.Quaternion(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const roles = faceRoles(q, view);
      const visible = [0, 1, 2, 3, 4, 5].filter((i) => new THREE.Vector3(...[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][i]).applyQuaternion(q).dot(view.depth) > 0.02);
      expect(roles.filter((r) => r === 0).length).toBe(1);
      expect(roles.filter((r) => r === 2).length).toBe(visible.length >= 2 ? 1 : 0);
      // hidden faces are mid
      [0, 1, 2, 3, 4, 5].filter((i) => !visible.includes(i)).forEach((i) => expect(roles[i]).toBe(1));
    }
  });
});

describe('faceShades', () => {
  const q = new THREE.Quaternion();
  it('follows the scene mode for the solids that carry it, always subtle for rods and beams', () => {
    const faceted = faceShades('cube-variable', 'faceted', q, view);
    expect(Math.max(...faceted) / Math.min(...faceted)).toBeGreaterThan(5); // linear: 3:1 on screen
    const subtleBeam = faceShades('beam', 'faceted', q, view);
    expect(subtleBeam).toEqual(faceShades('beam', 'subtle', q, view));
    expect(faceShades('rod', 'pale', q, view)).toEqual(faceShades('rod', 'subtle', q, view));
  });
  it('is exact on screen for a given colour: faceted 3:1, subtle 1.2:1, pale 1.1:1, whatever the hue', () => {
    const luma = (hex, m) => { const c = new THREE.Color(hex).multiplyScalar(m); c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b); const o = c.getHex(); return 0.299 * ((o >> 16) & 255) + 0.587 * ((o >> 8) & 255) + 0.114 * (o & 255); };
    const roles = faceRoles(q, view);
    const lightI = roles.indexOf(0), darkI = roles.indexOf(2);
    for (const hex of ['#8f8a7c', '#7a746a', '#c1362b', '#2a3a8f']) {
      const f = faceShades('cube-variable', 'faceted', q, view, hex);
      expect(luma(hex, f[lightI]) / luma(hex, f[darkI])).toBeGreaterThan(2.8);
      expect(luma(hex, f[lightI]) / luma(hex, f[darkI])).toBeLessThan(3.2);
      const s = faceShades('cube-variable', 'subtle', q, view, hex);
      expect(luma(hex, s[lightI]) / luma(hex, s[darkI])).toBeGreaterThan(1.15);
      expect(luma(hex, s[lightI]) / luma(hex, s[darkI])).toBeLessThan(1.3);
    }
  });
  it('never darkens a face below the floor: a dark colour is lifted as a whole, up to the cap', () => {
    const luma = (hex, m) => { const c = new THREE.Color(hex).multiplyScalar(m); c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b); const o = c.getHex(); return 0.299 * ((o >> 16) & 255) + 0.587 * ((o >> 8) & 255) + 0.114 * (o & 255); };
    const roles = faceRoles(q, view);
    for (const hex of ['#3a3a38', '#201d18', '#000000']) {
      const f = faceShades('cube-variable', 'faceted', q, view, hex);
      const dark = luma(hex, f[roles.indexOf(2)]);
      // the floor, or as far as the cap lets the colour be lifted
      const reachable = Math.min(DARK_FLOOR, luma(hex, 1) * DISPLAY.faceted[2] * LIFT_CAP);
      expect(dark).toBeGreaterThanOrEqual(reachable - 2);
      expect(Number.isFinite(dark)).toBe(true);
    }
  });
  it('is null for flat forms and the sphere (they keep their own tones)', () => {
    for (const type of ['circle', 'sphere', 'triangle', 'segment', 'crescent', 'frame', 'ring']) {
      expect(hasBoxTone(type)).toBe(false);
      expect(faceShades(type, 'faceted', q, view)).toBeNull();
    }
  });
});

// a mesh double with the tone state materialSetMesh / installPigmentResponse give a real one
function toneMesh(shade) {
  const mats = shade.map((s) => ({ userData: { tone: { shade: s, uShadeFrom: { value: s }, uShadeMid: { value: s } } } }));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.material = mats;
  mesh.userData.shade = shade.slice();
  mesh.userData.baseColor = new THREE.Color('#808080');
  mesh.userData.applyShade = () => {};
  mesh.userData.front = { uFront: { value: 1 }, uFrontA: { value: 1 }, uFrom: { value: new THREE.Color() }, uMid: { value: new THREE.Color() } };
  return mesh;
}
const T = (mesh) => mesh.material.map((m) => m.userData.tone);

describe('tone layers ride the colour front', () => {
  it('uninterrupted: the old tone goes under the new one, which is in force at once', () => {
    const mesh = toneMesh([0.5, 1, 2]);
    shiftShade(mesh, false);
    setShade(mesh, [1, 1, 1]);
    expect(T(mesh).map((t) => t.uShadeFrom.value)).toEqual([0.5, 1, 2]);
    expect(T(mesh).map((t) => t.uShadeMid.value)).toEqual([0.5, 1, 2]);
    expect(T(mesh).map((t) => t.shade)).toEqual([1, 1, 1]);
    expect(mesh.userData.shade).toEqual([1, 1, 1]);
  });
  it('interrupted: the layer in flight is kept under the newest one', () => {
    const mesh = toneMesh([1, 1, 1]);
    shiftShade(mesh, false); setShade(mesh, [2, 2, 2]);        // change 1: from 1 to 2
    shiftShade(mesh, true); setShade(mesh, [3, 3, 3]);         // change 2 arrives mid-change
    expect(T(mesh).map((t) => t.uShadeFrom.value)).toEqual([1, 1, 1]); // the first change's old tone is still the bottom layer
    expect(T(mesh).map((t) => t.uShadeMid.value)).toEqual([2, 2, 2]);  // the one in flight, frozen
    expect(T(mesh).map((t) => t.shade)).toEqual([3, 3, 3]);
    settleShade(mesh);
    expect(T(mesh).map((t) => t.uShadeFrom.value)).toEqual([3, 3, 3]);
  });
  it('are no-ops on a mesh without face shades (the sphere, test doubles)', () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    expect(() => { shiftShade(m, true); setShade(m, [1]); settleShade(m); }).not.toThrow();
  });
  it('Tween.add retones a mesh and keeps the old tone as the layer under the colour front', () => {
    const mesh = toneMesh([0.4, 0.8, 1.2]);
    const target = { position: new THREE.Vector3(), rotation: { x: 0, y: 0, z: 0 }, scale: new THREE.Vector3(1, 1, 1), hex: '#ff0000', shade: [1.5, 1.5, 1.5] };
    Tween.add(mesh, target, 1000);
    expect(mesh.userData.shade).toEqual([1.5, 1.5, 1.5]);
    expect(T(mesh).map((t) => t.uShadeFrom.value)).toEqual([0.4, 0.8, 1.2]);
    expect(mesh.userData.front.uFront.value).toBe(0);
    Tween.removeForMesh(mesh);
  });
  it('Tween.add without a shade (legacy, shapes leaving) leaves the tone alone', () => {
    const mesh = toneMesh([0.4, 0.8, 1.2]);
    Tween.add(mesh, { position: new THREE.Vector3(), rotation: { x: 0, y: 0, z: 0 }, scale: new THREE.Vector3(1, 1, 1), hex: '#00ff00' }, 1000);
    expect(mesh.userData.shade).toEqual([0.4, 0.8, 1.2]);
    expect(T(mesh).map((t) => t.uShadeFrom.value)).toEqual([0.4, 0.8, 1.2]);
    Tween.removeForMesh(mesh);
  });
});
