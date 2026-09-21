import * as THREE from 'three';
import { shadeHex, grainTexture } from '../texture/materials.js';
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
    const shaded = shadeHex(hex, 1.0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: shaded, map: grainTexture(shaded), side: THREE.DoubleSide
    }));
    mesh.userData.baseHex = hex;
    mesh.userData.shadeMultipliers = [1.0];
    mesh.userData.shapeType = TYPE;
    mesh.userData.facesCamera = true;
    mesh.quaternion.copy(Billboard.get());
    return mesh;
  },

  // uniform in x/y since it never rotates — only overall size changes
  randomScale() {
    const s = 0.5 + Math.random() * 1.7;
    return new THREE.Vector3(s, s, 1);
  }
};
