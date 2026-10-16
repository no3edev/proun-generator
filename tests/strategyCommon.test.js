import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  frameFor, screenBasis, lift, screenDirection, barOrientation, flatOrientation, blockOrientation,
  splitPalette, hexToHsl, pickWeighted
} from '../src/generator/strategies/common.js';
import { CAMERA, ORIENTATIONS } from '../src/config/defaults.js';
import { depthAxis, billboard, palettes } from './helpers/scene.js';

const basis = screenBasis(depthAxis);
const projAngle = (v) => Math.atan2(v.dot(basis.up), v.dot(basis.right));
const modPi = (a) => ((a % Math.PI) + Math.PI) % Math.PI;

describe('screen basis', () => {
  it('is the basis a lookAt camera at the same position derives', () => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    cam.position.set(...CAMERA.position);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const m = cam.matrixWorld.elements;
    expect(basis.right.distanceTo(new THREE.Vector3(m[0], m[1], m[2]))).toBeLessThan(1e-9);
    expect(basis.up.distanceTo(new THREE.Vector3(m[4], m[5], m[6]))).toBeLessThan(1e-9);
    expect(basis.depth.distanceTo(new THREE.Vector3(m[8], m[9], m[10]))).toBeLessThan(1e-9);
  });

  it('lift() puts a point where it was asked on screen, whatever its depth', () => {
    for (const d of [-9, 0, 4]) {
      const p = lift(basis, 1.5, -0.75, d);
      expect(p.dot(basis.right)).toBeCloseTo(1.5, 9);
      expect(p.dot(basis.up)).toBeCloseTo(-0.75, 9);
      expect(p.dot(basis.depth)).toBeCloseTo(d, 9);
    }
  });

  it('frameFor() follows the orientation, and falls back to landscape', () => {
    const land = frameFor('landscape');
    expect(land.halfH).toBe(CAMERA.frustumSize / 2);
    expect(land.halfW / land.halfH).toBeCloseTo(ORIENTATIONS.landscape.w / ORIENTATIONS.landscape.h, 9);
    expect(frameFor('portrait').halfW).toBeLessThan(frameFor('portrait').halfH);
    expect(frameFor('square').halfW).toBe(frameFor('square').halfH);
    expect(frameFor(undefined)).toEqual(land);
    expect(frameFor('nope')).toEqual(land);
  });
});

describe('orientations', () => {
  it('screenDirection() projects at the requested angle, tilt or no tilt', () => {
    for (const a of [-1.1, 0.2, 0.7, 2.4]) for (const tilt of [0, 0.2, -0.3]) {
      const d = screenDirection(basis, a, tilt);
      expect(d.length()).toBeCloseTo(1, 9);
      expect(modPi(projAngle(d)) - modPi(a)).toBeCloseTo(0, 9);
      expect(d.dot(basis.depth)).toBeCloseTo(Math.sin(tilt), 9);
    }
  });

  it('barOrientation() lays the long (x) axis along the direction, whatever the roll', () => {
    const d = screenDirection(basis, 0.6, 0.1);
    for (const roll of [0, 0.5, 1.9]) {
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(barOrientation(d, roll));
      expect(x.distanceTo(d)).toBeLessThan(1e-9);
    }
  });

  it('flatOrientation() keeps a form facing the camera and turns it in the picture plane', () => {
    const q = flatOrientation(billboard, 0.8);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(n.distanceTo(basis.depth)).toBeLessThan(1e-9);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(modPi(projAngle(x))).toBeCloseTo(modPi(0.8 + projAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(billboard))), 9);
  });

  it('blockOrientation() brings the nearest projected edge onto the angle', () => {
    for (const a of [-0.9, 0.3, 0.75, 1.2]) {
      const q = blockOrientation(basis, a);
      const edges = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => new THREE.Vector3(...e).applyQuaternion(q));
      const off = Math.min(...edges.map((e) => {
        const d = Math.abs(modPi(projAngle(e)) - modPi(a));
        return Math.min(d, Math.PI - d);
      }));
      expect(off).toBeLessThan(1e-9);
    }
  });
});

describe('palette split', () => {
  it('separates saturated hues from neutrals and orders neutrals dark -> light', () => {
    const { saturated, neutrals } = splitPalette({ accents: ['#c1362b', '#3a3a38', '#b08f6a', '#8f8a7c', '#d8d3c4'] });
    expect(saturated).toEqual(['#c1362b']);
    expect(neutrals[0]).toBe('#3a3a38');
    const lums = neutrals.map((h) => hexToHsl(h).l);
    expect([...lums].sort((a, b) => a - b)).toEqual(lums);
  });

  it('sets aside neutrals that vanish against the paper (unless nothing else is left)', () => {
    expect(splitPalette({ accents: ['#3a3a38', '#e9e4d8'], paper: '#eae5d9' }).neutrals).toEqual(['#3a3a38']);
    expect(splitPalette({ accents: ['#e9e4d8'], paper: '#eae5d9' }).neutrals).toEqual(['#e9e4d8']);
  });

  it('every shipped palette has neutrals to work with', () => {
    for (const [name, p] of Object.entries(palettes)) {
      expect(splitPalette(p).neutrals.length, name).toBeGreaterThan(0);
    }
  });
});

describe('pickWeighted', () => {
  it('follows the weights, skips zero weights, and returns null for nothing', () => {
    expect(pickWeighted(() => 0.99, [['a', 1], ['b', 0]])).toBe('a');
    expect(pickWeighted(() => 0.0, [['a', 1], ['b', 3]])).toBe('a');
    expect(pickWeighted(() => 0.5, [['a', 1], ['b', 3]])).toBe('b');
    expect(pickWeighted(() => 0.5, [])).toBeNull();
  });
});
