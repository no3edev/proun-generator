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
    // for flat shading (MeshBasicMaterial ignores real lights).
    // Modern three.js already builds this non-indexed; toNonIndexed()
    // is only called as a defensive no-op for older/indexed builds.
    const rawGeo = new THREE.IcosahedronGeometry(0.68, DETAIL);
    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
    const pos = geo.attributes.position;
    const vertexCount = pos.count;
    const faceCount = vertexCount / 3;
    const colors = new Float32Array(vertexCount * 3);
    const faceFactors = new Float32Array(faceCount); // light/dark factor per facet
    const lightDir = new THREE.Vector3(0.4, 0.85, 0.35).normalize();
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), normal = new THREE.Vector3();

    for (let f = 0; f < faceCount; f++) {
      const i = f * 3;
      vA.fromBufferAttribute(pos, i);
      vB.fromBufferAttribute(pos, i + 1);
      vC.fromBufferAttribute(pos, i + 2);
      normal.crossVectors(e1.subVectors(vC, vB), e2.subVectors(vA, vB)).normalize();
      faceFactors[f] = 0.55 + (normal.dot(lightDir) * 0.5 + 0.5) * 0.65;
    }
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    geo.setAttribute('color', colorAttr);

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    mesh.userData.shapeType = TYPE;
    mesh.userData.baseColor = new THREE.Color(hex);

    // Shading contract (see texture/materials.js): repaint every facet from
    // `base`. One computation per facet (shared by its 3 vertices), no
    // allocation — this runs every frame of a transition.
    const shaded = new THREE.Color();
    mesh.userData.applyShade = (base) => {
      for (let f = 0; f < faceCount; f++) {
        shaded.copy(base).multiplyScalar(faceFactors[f]);
        clampColor(shaded);
        for (let j = 0; j < 3; j++) colorAttr.setXYZ(f * 3 + j, shaded.r, shaded.g, shaded.b);
      }
      colorAttr.needsUpdate = true;
    };
    mesh.userData.applyShade(mesh.userData.baseColor);
    return mesh;
  },

  randomScale(rng) {
    const s = 0.6 + rng() * 1.0;
    return new THREE.Vector3(s, s, s);
  }
};
