import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CAMERA, SHAPE_LIMITS } from '../src/config/defaults.js';
import { computeAABB } from '../src/generator/CollisionResolver.js';
import { each, makeConfig, layoutOf, cameraPosition, depthAxis, billboard, shapeRegistry } from './helpers/scene.js';

// Collision resolution slides shapes along the view axis, far when shapes are
// many and large. Nothing may be cut by the camera's clip planes: with the old
// 0.1..100 planes, shapes pushed more than ~7.4 units toward the camera
// vanished (67% of scenes with 2 of each box at size 2-3 lost a shape).
describe('camera clip planes', () => {
  const dist = cameraPosition.length();
  const nearDepth = dist - CAMERA.near; // largest depth (along the view axis from the origin) still inside
  const farDepth = dist - CAMERA.far;   // smallest

  function depthExtent(entry) {
    const shape = shapeRegistry.find((s) => s.type === entry.type);
    const q = shape.facesCamera
      ? billboard
      : new THREE.Quaternion().setFromEuler(new THREE.Euler(...entry.rotation));
    const box = computeAABB(shape.localHalfExtents, new THREE.Vector3(...entry.position), q, new THREE.Vector3(...entry.scale));
    let lo = Infinity, hi = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const d = x * depthAxis.x + y * depthAxis.y + z * depthAxis.z;
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    return [lo, hi];
  }

  const cases = [
    ['default sizes, 4 of each', each(4, { rod: 4 }), [1, 1]],
    ['2 of each at size 2-3', each(2), [2, 3]],
    ['UI limit: 12 of each at size 10', each(SHAPE_LIMITS.count.max, { rod: SHAPE_LIMITS.count.max }), [SHAPE_LIMITS.size.max, SHAPE_LIMITS.size.max]]
  ];
  for (const [name, counts, [sizeMin, sizeMax]] of cases) {
    it(`keeps every shape inside the clip planes: ${name}`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        layoutOf(makeConfig(seed, counts, { shape: { sizeMin, sizeMax } })).forEach((e) => {
          const [lo, hi] = depthExtent(e);
          expect(hi).toBeLessThan(nearDepth);
          expect(lo).toBeGreaterThan(farDepth);
        });
      }
    });
  }

  it('near is behind the camera (orthographic cameras allow it) and far is beyond it', () => {
    expect(CAMERA.near).toBeLessThan(0);
    expect(CAMERA.far).toBeGreaterThan(dist);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA.near, CAMERA.far);
    expect(() => cam.updateProjectionMatrix()).not.toThrow();
  });
});
