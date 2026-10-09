import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';
import { Billboard } from '../core/Billboard.js';

const TYPE = 'circle';

export default {
  type: TYPE,
  label: 'Circle',
  facesCamera: true,
  localHalfExtents: { x: 0.75, y: 0.75, z: 0.02 },

  create(hex) {
    // a flat disc, oriented once to face the fixed camera and never
    // touched by rotation again — only position and size change
    const geo = new THREE.CircleGeometry(0.75, 48);
    const mesh = materialSetMesh(geo, hex, [1.0], TYPE, { side: THREE.DoubleSide });
    mesh.userData.facesCamera = true;
    mesh.quaternion.copy(Billboard.get());
    return mesh;
  },

  // uniform in x/y since it never rotates — only overall size changes
  randomScale(rng) {
    const s = 0.5 + rng() * 1.7;
    return new THREE.Vector3(s, s, 1);
  }
};
