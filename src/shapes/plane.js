import * as THREE from 'three';
import { boxMesh } from '../texture/materials.js';

const TYPE = 'plane';

export default {
  type: TYPE,
  label: 'Plane',
  facesCamera: false,
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },

  create(hex) {
    return boxMesh(hex, TYPE);
  },

  // always thin on one randomly-chosen axis — unlike cube-variable's
  // "slab" mood, the two broad axes vary independently of each other,
  // so planes range from near-square to long rectangular strips
  randomScale(rng) {
    const axes = ['x', 'y', 'z'];
    const thinAxis = axes[Math.floor(rng() * 3)];
    const s = { x: 1, y: 1, z: 1 };
    axes.forEach((a) => {
      s[a] = a === thinAxis
        ? 0.04 + rng() * 0.08
        : 0.8 + rng() * 2.2;
    });
    return new THREE.Vector3(s.x, s.y, s.z);
  }
};
