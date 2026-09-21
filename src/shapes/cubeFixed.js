import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'cube-fixed';

// shade order matches BoxGeometry's default face groups: +x -x +y -y +z -z
const SHADE_MULTIPLIERS = [0.82, 0.82, 1.05, 0.62, 1.0, 0.7];

export default {
  type: TYPE,
  label: 'Cube (fixed)',
  facesCamera: false,
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },

  create(hex) {
    return materialSetMesh(new THREE.BoxGeometry(1, 1, 1), hex, SHADE_MULTIPLIERS, TYPE);
  },

  // always a true cube — uniform scale only
  randomScale() {
    const s = 0.6 + Math.random() * 1.0;
    return new THREE.Vector3(s, s, s);
  }
};
