import * as THREE from 'three';
import { boxMesh } from '../texture/materials.js';

const TYPE = 'cube-variable';

export default {
  type: TYPE,
  label: 'Cube (variable)',
  facesCamera: false,
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },

  create(hex) {
    return boxMesh(hex, TYPE);
  },

  // independent per-axis scale so this cube can read as a thin
  // stripe, a flat slab, or a chunky block — three shape "moods"
  // drawn from with different odds, then jittered so results aren't
  // too rigidly categorical
  randomScale(rng) {
    const axes = ['x', 'y', 'z'];
    const roll = rng();
    const s = { x: 1, y: 1, z: 1 };
    if (roll < 0.35) {
      const longAxis = axes[Math.floor(rng() * 3)];
      axes.forEach((a) => { s[a] = a === longAxis ? 2.4 + rng() * 2.0 : 0.1 + rng() * 0.16; });
    } else if (roll < 0.65) {
      const thinAxis = axes[Math.floor(rng() * 3)];
      axes.forEach((a) => { s[a] = a === thinAxis ? 0.08 + rng() * 0.14 : 1.0 + rng() * 1.3; });
    } else {
      axes.forEach((a) => { s[a] = 0.6 + rng() * 0.9; });
    }
    return new THREE.Vector3(s.x, s.y, s.z);
  }
};
