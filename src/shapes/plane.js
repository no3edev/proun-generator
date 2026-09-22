import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'plane';

// same box geometry/shading recipe as the two cube variants — a plane
// is just a box whose thickness never leaves the "very thin" range
const SHADE_MULTIPLIERS = [0.82, 0.82, 1.05, 0.62, 1.0, 0.7];

export default {
  type: TYPE,
  label: 'Plane',
  facesCamera: false,
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },

  create(hex) {
    return materialSetMesh(new THREE.BoxGeometry(1, 1, 1), hex, SHADE_MULTIPLIERS, TYPE);
  },

  // always thin on one randomly-chosen axis — unlike cube-variable's
  // "slab" mood, the two broad axes vary independently of each other,
  // so planes range from near-square to long rectangular strips
  randomScale() {
    const axes = ['x', 'y', 'z'];
    const thinAxis = axes[Math.floor(Math.random() * 3)];
    const s = { x: 1, y: 1, z: 1 };
    axes.forEach((a) => {
      s[a] = a === thinAxis
        ? 0.04 + Math.random() * 0.08
        : 0.8 + Math.random() * 2.2;
    });
    return new THREE.Vector3(s.x, s.y, s.z);
  }
};
