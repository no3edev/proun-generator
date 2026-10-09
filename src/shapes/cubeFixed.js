import * as THREE from 'three';
import { boxMesh } from '../texture/materials.js';

const TYPE = 'cube-fixed';

export default {
  type: TYPE,
  label: 'Cube (fixed)',
  facesCamera: false,
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },

  create(hex) {
    return boxMesh(hex, TYPE);
  },

  // always a true cube — uniform scale only
  randomScale(rng) {
    const s = 0.6 + rng() * 1.0;
    return new THREE.Vector3(s, s, s);
  }
};
