import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'cube-variable';

// shade order matches BoxGeometry's default face groups: +x -x +y -y +z -z
const SHADE_MULTIPLIERS = [0.82, 0.82, 1.05, 0.62, 1.0, 0.7];

export default {
  type: TYPE,
  label: 'Cube (variable)',
  facesCamera: false,
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },

  create(hex) {
    return materialSetMesh(new THREE.BoxGeometry(1, 1, 1), hex, SHADE_MULTIPLIERS, TYPE);
  },

  // independent per-axis scale so this cube can read as a thin
  // stripe, a flat slab, or a chunky block — three shape "moods"
  // drawn from with different odds, then jittered so results aren't
  // too rigidly categorical
  randomScale() {
    const axes = ['x', 'y', 'z'];
    const roll = Math.random();
    const s = { x: 1, y: 1, z: 1 };
    if (roll < 0.35) {
      const longAxis = axes[Math.floor(Math.random() * 3)];
      axes.forEach((a) => { s[a] = a === longAxis ? 2.4 + Math.random() * 2.0 : 0.1 + Math.random() * 0.16; });
    } else if (roll < 0.65) {
      const thinAxis = axes[Math.floor(Math.random() * 3)];
      axes.forEach((a) => { s[a] = a === thinAxis ? 0.08 + Math.random() * 0.14 : 1.0 + Math.random() * 1.3; });
    } else {
      axes.forEach((a) => { s[a] = 0.6 + Math.random() * 0.9; });
    }
    return new THREE.Vector3(s.x, s.y, s.z);
  }
};
