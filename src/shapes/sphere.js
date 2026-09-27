import * as THREE from 'three';
import { clampColor } from '../texture/materials.js';

const TYPE = 'sphere';

// Icosahedron subdivision level. 1 = 80 triangles (original prototype),
// 2 = 320 (previous), 3 = 1280 (current — near-smooth, still flat-shaded
// facets). Bump this further if you want an even rounder sphere; drop
// it for something more crystalline. create() only runs at startup and
// when an instance is added via the count stepper, not per re-randomize
// or tween frame, so this is cheap even at higher detail levels.
const DETAIL = 3;

export default {
  type: TYPE,
  label: 'Sphere',
  facesCamera: false,
  localHalfExtents: { x: 0.68, y: 0.68, z: 0.68 },

  create(hex) {
    // low-poly icosahedron with per-face vertex colors standing in
    // for flat shading (MeshBasicMaterial ignores real lights)
    // low-poly icosahedron with per-face vertex colors standing in
    // for flat shading (MeshBasicMaterial ignores real lights).
    // Modern three.js already builds this non-indexed; toNonIndexed()
    // is only called as a defensive no-op for older/indexed builds.
    const rawGeo = new THREE.IcosahedronGeometry(0.68, DETAIL);
    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
    const pos = geo.attributes.position;
    const vertexCount = pos.count;
    const colors = new Float32Array(vertexCount * 3);
    const shadeFactors = new Float32Array(vertexCount);
    const lightDir = new THREE.Vector3(0.4, 0.85, 0.35).normalize();
    const base = new THREE.Color(hex);
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();

    for (let i = 0; i < vertexCount; i += 3) {
      vA.fromBufferAttribute(pos, i);
      vB.fromBufferAttribute(pos, i + 1);
      vC.fromBufferAttribute(pos, i + 2);
      const normal = new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(vC, vB), new THREE.Vector3().subVectors(vA, vB))
        .normalize();
      const factor = 0.55 + (normal.dot(lightDir) * 0.5 + 0.5) * 0.65;
      for (let j = 0; j < 3; j++) {
        shadeFactors[i + j] = factor;
        const c = clampColor(base.clone().multiplyScalar(factor));
        colors[(i + j) * 3] = c.r;
        colors[(i + j) * 3 + 1] = c.g;
        colors[(i + j) * 3 + 2] = c.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    mesh.userData.baseHex = hex;
    mesh.userData.shapeType = TYPE;
    mesh.userData.isVertexColored = true;
    mesh.userData.shadeFactors = shadeFactors;
    return mesh;
  },

  randomScale() {
    const s = 0.6 + Math.random() * 1.0;
    return new THREE.Vector3(s, s, s);
  }
};
